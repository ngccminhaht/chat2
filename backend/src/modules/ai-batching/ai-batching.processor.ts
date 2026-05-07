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
import {
  Conversation,
  ConversationDocument,
} from "@/common/database/schemas/conversation.schema";
import { AIMessageParser } from "./utils/ai-message-parser";

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
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
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
      // Check if AI is still enabled for this conversation
      const conv = await this.batchingService.getConversation(conversationId);
      if (conv?.aiEnabled === false) {
        this.logger.log(
          `⏭️ [AI Batch] Skipping job ${job.id}: AI disabled for conversation ${conversationId}`,
        );
        return;
      }

      // Update state to AI_RESPONDING
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

        // Parse AI response to extract text and media (images/videos)
        const messageParts = AIMessageParser.parseTextAndMedia(aiResponse.answer);
        this.logger.log(
          `📋 [AI Batch] Parsed AI response into ${messageParts.length} part(s) | ` +
            `Types: ${messageParts.map((p) => p.type).join(', ')}`,
        );

        // Send each part as a separate message
        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          const isLastPart = i === messageParts.length - 1;

          this.logger.log(
            `📨 [AI Batch] Processing part ${i + 1}/${messageParts.length} | ` +
              `Type: ${part.type} | IsLast: ${isLastPart}`,
          );

          // Validate media URLs
          if (part.type === 'image' || part.type === 'video') {
            if (!AIMessageParser.isValidMediaUrl(part.content, part.type)) {
              this.logger.warn(
                `⚠️ [AI Batch] Invalid ${part.type} URL, sending as text fallback | ` +
                  `URL: ${part.content.substring(0, 100)}...`,
              );
              // Send as text fallback
              await this.sendMessagePart(
                conversationId,
                conversation,
                { type: 'text', content: `${part.alt || part.type}\n${part.content}` },
                isLastPart,
              );
              continue;
            }
          }

          // Send the message part with retry logic
          const maxRetries = part.type === 'text' ? 1 : 3; // More retries for media
          let retryCount = 0;
          let success = false;

          while (retryCount < maxRetries && !success) {
            try {
              await this.sendMessagePart(
                conversationId,
                conversation,
                part,
                isLastPart,
              );
              success = true;
            } catch (error) {
              retryCount++;
              this.logger.warn(
                `⚠️ [AI Batch] Failed to send ${part.type} part (attempt ${retryCount}/${maxRetries}) | ` +
                  `Error: ${error.message}`,
              );

              if (retryCount >= maxRetries) {
                // Send text fallback after all retries fail
                if (part.type !== 'text') {
                  this.logger.error(
                    `❌ [AI Batch] All retries failed for ${part.type}, sending text fallback`,
                  );
                  await this.sendMessagePart(
                    conversationId,
                    conversation,
                    {
                      type: 'text',
                      content: `${part.alt || part.type}\n${part.content}`,
                    },
                    isLastPart,
                  );
                } else {
                  throw error; // Re-throw for text messages
                }
              } else {
                // Wait before retry (exponential backoff)
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * retryCount),
                );
              }
            }
          }

          // Add delay between messages (except after last message)
          if (!isLastPart) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } else {
        this.logger.warn(
          `⚠️ [AI Batch] No AI response generated | Conversation: ${conversationId} | ` +
            `This may be due to: AI disabled, API error, or empty response`,
        );
      }

      // Reset to AI_ACTIVE after processing, but ONLY if it wasn't changed by a tool (e.g. HUMAN_TAKEOVER)
      const currentConv = await this.batchingService.getConversation(conversationId);
      if (currentConv && currentConv.aiState === "AI_RESPONDING") {
        await this.batchingService.updateAIState(conversationId, "AI_ACTIVE");
      } else if (currentConv) {
        this.logger.log(
          `⚠️ [AI Batch] Not resetting state to AI_ACTIVE. Current state was changed to ${currentConv.aiState} during AI processing.`
        );
      }
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

  /**
   * Send a single message part (text, image, or video)
   * Handles both web chat and platform messages
   */
  private async sendMessagePart(
    conversationId: string,
    conversation: any,
    part: { type: 'text' | 'image' | 'video'; content: string; alt?: string },
    isLastPart: boolean,
  ): Promise<void> {
    // Build message content based on part type
    let messageContent: any;
    let messageType: MessageType;

    if (part.type === 'text') {
      messageType = MessageType.TEXT;
      messageContent = { text: part.content };
    } else if (part.type === 'image') {
      messageType = MessageType.IMAGE;
      messageContent = { mediaUrl: part.content, mediaType: 'image' };
    } else if (part.type === 'video') {
      messageType = MessageType.VIDEO;
      messageContent = { mediaUrl: part.content, mediaType: 'video' };
    } else {
      throw new Error(`Unknown message part type: ${part.type}`);
    }

    // Save message to database
    const savedMessage = await this.aiResponseService.saveAIMessage(
      conversationId,
      part.type === 'text' ? part.content : `[${part.type.toUpperCase()}]`,
    );

    // Check if message was discarded (aiEnabled was disabled)
    if (!savedMessage) {
      this.logger.log(
        `⏭️ [AI Batch] Message part discarded - AI disabled during processing | ` +
          `Conversation: ${conversationId}`,
      );
      return;
    }

    const { message, sessionId, organizationId: orgId } = savedMessage;

    // Update message with correct type and content
    message.type = messageType;
    message.content = messageContent;
    await message.save();

    this.logger.log(
      `💾 [AI Batch] Message part saved | Type: ${part.type} | ` +
        `Message: ${message._id} | Platform: ${conversation.platform}`,
    );

    // Handle message delivery based on platform
    if (conversation.platform === Platform.WEB) {
      if (sessionId) {
        // Web chat: emit via WebSocket
        const widgetPayload = {
          message: {
            _id: message._id.toString(),
            type: messageType,
            content: messageContent,
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
          `📤 [AI Batch] Emitted ${part.type} message to web visitor | ` +
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
            type: messageType,
            text: part.type === 'text' ? part.content : undefined,
            mediaUrl:
              part.type !== 'text' ? part.content : undefined,
            mediaType: part.type !== 'text' ? part.type : undefined,
          },
          credentials: {
            accessToken: platformConnection.credentials.accessToken,
          },
          timestamp: Date.now(),
        };

        this.logger.log(
          `📤 [AI Batch] Publishing ${part.type} message to Kafka...`,
          JSON.stringify(
            {
              topic: KAFKA_TOPICS.MESSAGES_OUTGOING,
              key: conversationId,
              messageId: outgoingEvent.messageId,
              platform: outgoingEvent.platform,
              messageType: outgoingEvent.message.type,
              hasMedia: !!outgoingEvent.message.mediaUrl,
            },
            null,
            2,
          ),
        );

        // Publish to Kafka for async processing
        await this.kafkaProducer.publish(KAFKA_TOPICS.MESSAGES_OUTGOING, {
          key: conversationId,
          value: outgoingEvent,
        });

        this.logger.log(
          `✅ [AI Batch] Successfully published ${part.type} message to Kafka | ` +
            `Message: ${message._id} | Platform: ${conversation.platform}`,
        );
      }
    }

    // Broadcast to org agents (only for last part to avoid spam)
    if (isLastPart) {
      const lastMessageText = part.type === 'text'
        ? part.content
        : `[${part.type.toUpperCase()}]`;

      // Update conversation in DB with lastMessage direction and reset counts
      await this.conversationModel.findByIdAndUpdate(conversationId, {
        lastMessage: {
          text: lastMessageText.substring(0, 100),
          timestamp: new Date(),
          senderId: "ai-agent",
          messageId: message._id,
          direction: "outbound",
        },
        unreadCount: 0,
      });

      const serializedMsg = JSON.parse(JSON.stringify(message.toObject()));
      this.websocketGateway.emitToOrgAgents(orgId, "message:new", {
        conversationId,
        message: serializedMsg,
      });
      this.websocketGateway.emitToOrgAgents(orgId, "conversation:updated", {
        _id: conversationId,
        lastMessage: {
          text: lastMessageText,
          timestamp: new Date(),
          direction: "outbound",
        },
        unreadCount: 0,
      });
    }
  }
}
