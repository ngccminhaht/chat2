/**
 * AI Batching Processor
 * Handles batch jobs when debounce timer expires
 */

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
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
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>
  ) {
    super();
  }

  async process(job: Job<BatchJobData>): Promise<void> {
    const { conversationId, organizationId, messageIds } = job.data;

    this.logger.log(
      `Processing batch for conversation ${conversationId} with ${messageIds.length} message(s)`
    );

    try {
      // Check if already responding (prevent duplicate processing)
      const conv = await this.batchingService.getConversation(conversationId);
      if (conv?.aiState === "AI_RESPONDING") {
        this.logger.warn(
          `Skipping batch ${job.id}: conversation ${conversationId} already AI_RESPONDING`
        );
        return;
      }

      // Update state to AI_RESPONDING (atomic check)
      await this.batchingService.updateAIState(conversationId, "AI_RESPONDING");

      // Get pending messages for this conversation
      const messages = await this.batchingService.getPendingMessages(
        conversationId,
        messageIds
      );

      if (messages.length === 0) {
        this.logger.warn(`No messages found for batch ${job.id}`);
        await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");
        return;
      }

      // Get conversation and customer for AI request
      const conversation = await this.batchingService.getConversation(
        conversationId
      );
      if (!conversation) {
        this.logger.warn(`Conversation ${conversationId} not found`);
        await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");
        return;
      }

      // Get customer if available
      let customer = null;
      if (conversation.customerId) {
        customer = await this.batchingService.getCustomer(
          conversation.customerId.toString()
        );
      }

      // Call AI service to generate response (with messages, supports streaming & continuity)
      const aiResponse = await this.aiResponseService.generateResponse(
        conversationId,
        organizationId,
        messages,
        customer
      );

      if (aiResponse?.answer) {
        // Save AI response as message
        const {
          message,
          sessionId,
          organizationId: orgId,
        } = await this.aiResponseService.saveAIMessage(
          conversationId,
          aiResponse.answer
        );

        this.logger.log(
          `AI response saved for ${conversationId}: message ${message._id}`
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
              widgetPayload
            );
            this.logger.log(`📤 Emitted AI message to visitor ${sessionId}`);
          } else {
            this.logger.warn(
              `Web chat conversation ${conversationId} has no sessionId, message saved but not delivered`
            );
          }
        } else {
          // Platform messages (Zalo, Facebook, etc.): publish to Kafka
          const platformConnection = await this.platformConnectionModel
            .findById(conversation.platformConnectionId)
            .exec();

          if (!platformConnection) {
            this.logger.error(
              `Platform connection not found for conversation ${conversationId}`
            );
          } else {
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

            // Publish to Kafka for async processing
            await this.kafkaProducer.publish(KAFKA_TOPICS.MESSAGES_OUTGOING, {
              key: conversationId,
              value: outgoingEvent,
            });

            this.logger.log(
              `📤 Published AI message to ${KAFKA_TOPICS.MESSAGES_OUTGOING}: ${message._id}`
            );
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
        this.logger.warn(`No AI response generated for ${conversationId}`);
      }

      // Reset to AI_ACTIVE after processing
      await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");
    } catch (error) {
      this.logger.error(
        `Failed to process AI batch for ${conversationId}: ${error.message}`,
        error.stack
      );

      // Reset state on error
      await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");

      throw error;
    }
  }
}
