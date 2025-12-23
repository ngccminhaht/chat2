/**
 * AI Batching Processor
 * Handles batch jobs when debounce timer expires
 */

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, Inject, forwardRef, Optional } from "@nestjs/common";
import { Job } from "bullmq";
import { AIBatchingService, AI_BATCH_QUEUE } from "./ai-batching.service";
import { AIResponseService } from "./ai-response.service";
import { BatchJobData } from "./dto/batch-job.dto";
import { VisitorGateway } from "@/modules/websocket/visitor.gateway";
import { WebsocketGateway } from "@/modules/websocket/websocket.gateway";
import { Platform } from "@/common/constants";

@Processor(AI_BATCH_QUEUE)
export class AIBatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(AIBatchingProcessor.name);

  constructor(
    private readonly batchingService: AIBatchingService,
    private readonly aiResponseService: AIResponseService,
    @Inject(forwardRef(() => VisitorGateway))
    private readonly visitorGateway: VisitorGateway,
    @Inject(forwardRef(() => WebsocketGateway))
    private readonly websocketGateway: WebsocketGateway
  ) {
    super();
  }

  async process(job: Job<BatchJobData>): Promise<void> {
    const { conversationId, organizationId, messageIds } = job.data;

    this.logger.log(
      `Processing batch for conversation ${conversationId} with ${messageIds.length} message(s)`
    );

    try {
      // Update state to AI_RESPONDING
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

        // Emit AI message to visitor via WebSocket
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
