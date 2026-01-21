/**
 * AI Batching Processor
 * Handles batch jobs when debounce timer expires
 */

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Job } from "bullmq";
import { AIBatchingService, AI_BATCH_QUEUE } from "./ai-batching.service";
import { AIResponseService } from "./ai-response.service";
import { BatchJobData } from "./dto/batch-job.dto";
import { VisitorGateway } from "@/modules/websocket/visitor.gateway";
import { WebsocketGateway } from "@/modules/websocket/websocket.gateway";
import { Platform, MessageType } from "@/common/constants";
import { KafkaProducerService } from "@/infra/kafka/kafka-producer.service";
import { KAFKA_TOPICS } from "@/infra/kafka/kafka.config";
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from "@/common/database/schemas/platform-connection.schema";

@Processor(AI_BATCH_QUEUE)
export class AIBatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(AIBatchingProcessor.name);

  constructor(
    private readonly batchingService: AIBatchingService,
    private readonly aiResponseService: AIResponseService,
    @Inject(forwardRef(() => VisitorGateway))
    private readonly visitorGateway: VisitorGateway,
    @Inject(forwardRef(() => WebsocketGateway))
    private readonly websocketGateway: WebsocketGateway,
    private readonly kafkaProducer: KafkaProducerService,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
  ) {
    super();
  }

  async process(job: Job<BatchJobData>): Promise<void> {
    const { conversationId, organizationId, messageIds } = job.data;
    const jobStartTime = Date.now();

    this.logger.log(
      `🔄 [AI Batch] ========== STARTING JOB ========== | ` +
        `Job ID: ${job.id} | Conversation: ${conversationId} | ` +
        `Org: ${organizationId} | Messages: ${messageIds.length} | ` +
        `Message IDs: ${messageIds.join(", ")} | ` +
        `Job attempts: ${job.attemptsMade + 1}`,
    );

    try {
      // Check if already responding (prevent duplicate processing)
      const conv = await this.batchingService.getConversation(conversationId);
      if (conv?.aiState === "AI_RESPONDING") {
        this.logger.warn(
          `⏭️ [AI Batch] Skipping job ${job.id}: conversation ${conversationId} already AI_RESPONDING`,
        );
        return;
      }

      // Update state to AI_RESPONDING (atomic check)
      await this.batchingService.updateAIState(conversationId, "AI_RESPONDING");

      // Get pending messages for this conversation (query DB directly)
      const messages = await this.batchingService.getPendingMessages(
        conversationId
      );

      if (messages.length === 0) {
        this.logger.warn(
          `⚠️ [AI Batch] No messages found for job ${job.id} | Conversation: ${conversationId}`,
        );
        await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");
        return;
      }

      this.logger.log(
        `📝 [AI Batch] Found ${messages.length} pending messages for conversation ${conversationId}`,
      );

      // Check if batch has any text messages - skip if only images
      // (Images should wait for text message, which will include them)
      const hasTextMessage = messages.some(
        (msg) => msg.type === MessageType.TEXT,
      );
      if (!hasTextMessage) {
        this.logger.log(
          `⏭️ [AI Batch] Skipping batch with only images (no text) - waiting for text message | ` +
            `Conversation: ${conversationId}`,
        );
        await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");
        return;
      }

      // Get conversation and customer for AI request
      const conversation =
        await this.batchingService.getConversation(conversationId);
      if (!conversation) {
        this.logger.warn(
          `⚠️ [AI Batch] Conversation ${conversationId} not found for job ${job.id}`,
        );
        await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");
        return;
      }

      // Get customer if available
      let customer = null;
      if (conversation.customerId) {
        customer = await this.batchingService.getCustomer(
          conversation.customerId.toString(),
        );
      }

      // Call AI service to generate response (with messages, supports streaming & continuity)
      this.logger.debug(
        `🤖 [AI Batch] Calling AI service for conversation ${conversationId}`,
      );

      const aiCallStartTime = Date.now();
      const aiResponse = await this.aiResponseService.generateResponse(
        conversationId,
        organizationId,
        messages,
        customer,
      );
      const aiCallDuration = Date.now() - aiCallStartTime;

      if (aiResponse?.answer) {
        this.logger.log(
          `✅ [AI Batch] AI response generated in ${aiCallDuration}ms | ` +
            `Conversation: ${conversationId} | Length: ${aiResponse.answer.length} chars`,
        );

        // Mark ALL messages in batch as sent to AI (not just images)
        const messageIdsToMark = messages.map(
          (msg) => msg._id as Types.ObjectId,
        );
        await this.batchingService.markMessagesAsSent(messageIdsToMark);
        this.logger.log(
          `✅ [AI Batch] Marked ${messageIdsToMark.length} message(s) as sent to AI`,
        );

        // Save AI response as message
        const savedMessage = await this.aiResponseService.saveAIMessage(
          conversationId,
          aiResponse.answer,
        );

        // Check if message was discarded (aiEnabled was disabled)
        if (!savedMessage) {
          this.logger.log(
            `⏭️ [AI Batch] Response discarded - AI disabled during processing | ` +
            `Conversation: ${conversationId}`,
          );
          return; // Exit early - don't send message to user
        }

        const { message, sessionId, organizationId: orgId } = savedMessage;

        this.logger.log(
          `💾 [AI Batch] AI response saved | Conversation: ${conversationId} | ` +
            `Message: ${message._id} | Platform: ${conversation.platform}`,
        );

        // Handle message delivery based on platform
        if (conversation.platform === Platform.WEB) {
          if (sessionId) {
            // Web chat: emit via WebSocket
            const widgetPayload = {
              message: {
                _id: message._id.toString(),
                content: {
                  text: aiResponse.answer,
                },
                sender: {
                  name: "AI Agent",
                  platformUserId: "ai-agent",
                },
                direction: "outbound" as const,
                createdAt:
                  (message as any).createdAt?.toISOString() ||
                  new Date().toISOString(),
              },
            };

            this.visitorGateway.emitToVisitor(
              sessionId,
              "message:received",
              widgetPayload,
            );
            this.logger.log(
              `📤 [AI Batch] Emitted AI message to web visitor | ` +
                `Session: ${sessionId} | Message: ${message._id}`,
            );
          } else {
            this.logger.warn(
              `⚠️ [AI Batch] Web chat conversation ${conversationId} has no sessionId | ` +
                `Message saved but not delivered`,
            );
          }
        } else {
          // Platform messages (Zalo, Facebook, etc.): publish to Kafka
          const platformConnection = await this.platformConnectionModel
            .findById(conversation.platformConnectionId)
            .exec();

          if (platformConnection) {
            // Build outgoing message event for Kafka
            const outgoingEvent = {
              messageId: message._id.toString(),
              conversationId: conversation._id.toString(),
              platform: conversation.platform as Platform,
              platformConnectionId: platformConnection._id.toString(),
              platformAccountId: platformConnection.platformAccountId,
              recipientId: conversation.customerPlatformUserId,
              message: {
                type: MessageType.TEXT,
                text: aiResponse.answer,
              },
              credentials: {
                accessToken: platformConnection.credentials.accessToken,
              },
              timestamp: Date.now(),
            };

            this.logger.log(
              `📤 [AI Batch] Publishing AI message to Kafka...`,
              JSON.stringify(
                {
                  topic: KAFKA_TOPICS.MESSAGES_OUTGOING,
                  key: conversationId,
                  messageId: outgoingEvent.messageId,
                  platform: outgoingEvent.platform,
                  recipientId: outgoingEvent.recipientId,
                  messageType: outgoingEvent.message.type,
                  messageTextLength: outgoingEvent.message.text?.length || 0,
                  hasAccessToken: !!outgoingEvent.credentials.accessToken,
                },
                null,
                2,
              ),
            );

            // Publish to Kafka for async processing
            try {
              await this.kafkaProducer.publish(KAFKA_TOPICS.MESSAGES_OUTGOING, {
                key: conversationId,
                value: outgoingEvent,
              });

              this.logger.log(
                `✅ [AI Batch] Successfully published AI message to Kafka | ` +
                  `Topic: ${KAFKA_TOPICS.MESSAGES_OUTGOING} | ` +
                  `Message: ${message._id} | Platform: ${conversation.platform} | ` +
                  `RecipientId: ${conversation.customerPlatformUserId}`,
              );
            } catch (kafkaError) {
              this.logger.error(
                `❌ [AI Batch] Failed to publish to Kafka | ` +
                  `Error: ${kafkaError.message} | ` +
                  `Message: ${message._id} | Platform: ${conversation.platform}`,
              );
              throw kafkaError;
            }
          }
        }

        // Broadcast to org agents so they see the AI reply
        const serializedMsg = JSON.parse(JSON.stringify(message.toObject()));
        this.websocketGateway.emitToOrgAgents(orgId, "message:new", {
          conversationId,
          message: serializedMsg,
        });
        this.websocketGateway.emitToOrgAgents(orgId, "conversation:updated", {
          _id: conversationId,
          lastMessage: {
            text: aiResponse.answer,
            timestamp: new Date(),
          },
          unreadCount: 0,
        });
      } else {
        this.logger.warn(
          `⚠️ [AI Batch] No AI response generated | Conversation: ${conversationId} | ` +
            `This may be due to: AI disabled, API error, or empty response`,
        );
      }

      // Reset to AI_ACTIVE after processing
      await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");

      const jobDuration = Date.now() - jobStartTime;
      this.logger.log(
        `✅ [AI Batch] Job ${job.id} completed successfully | ` +
          `Conversation: ${conversationId} | Total duration: ${jobDuration}ms`,
      );
    } catch (error) {
      const jobDuration = Date.now() - jobStartTime;

      this.logger.error(
        `❌ [AI Batch] Job ${job.id} failed | ` +
          `Conversation: ${conversationId} | Org: ${organizationId} | ` +
          `Duration: ${jobDuration}ms | Error: ${error.message}`,
      );

      this.logger.error(`❌ [AI Batch] Error stack trace:`, error.stack);

      // Reset state on error
      await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");

      // Log recovery advice
      this.logger.error(
        `💡 [AI Batch] Recovery: Conversation ${conversationId} state reset to AI_ACTIVE. ` +
          `Next visitor message will trigger a new batch.`,
      );

      throw error;
    }
  }
}
