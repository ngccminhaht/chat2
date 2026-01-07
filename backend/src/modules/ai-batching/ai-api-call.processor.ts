/**
 * AI API Call Processor
 * Handles AI API calls as BullMQ jobs with automatic retry
 */

import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Job } from "bullmq";
import {
  AI_API_CALL_QUEUE,
  AIAPICallJobData,
  AIAPICallResult,
} from "./ai-api-call.queue";
import {
  Organization,
  OrganizationDocument,
} from "@/common/database/schemas/organization.schema";
import {
  Message,
  MessageDocument,
} from "@/common/database/schemas/message.schema";
import {
  Conversation,
  ConversationDocument,
} from "@/common/database/schemas/conversation.schema";
import {
  Customer,
  CustomerDocument,
} from "@/common/database/schemas/customer.schema";
import { MessageCombiner } from "@/modules/ai-agents/utils/message-combiner";
import axios from "axios";
import {
  categorizeAIError,
  AIErrorType,
  AIAPIError,
} from "./ai-api-retry.config";

@Processor(AI_API_CALL_QUEUE, {
  concurrency: 5, // Process up to 5 AI calls concurrently
})
export class AIAPICallProcessor extends WorkerHost {
  private readonly logger = new Logger(AIAPICallProcessor.name);

  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>
  ) {
    super();
  }

  async process(
    job: Job<AIAPICallJobData, AIAPICallResult>
  ): Promise<AIAPICallResult> {
    const { conversationId, organizationId, messageIds, customerId } = job.data;
    const startTime = Date.now();
    const attempt = job.attemptsMade + 1;
    const firstAttemptAt = job.data.firstAttemptAt || startTime;

    this.logger.log(
      `🤖 [AI API Job] Starting job ${job.id} | Conversation: ${conversationId} | ` +
        `Attempt: ${attempt}/${job.opts.attempts || 1} | ` +
        `Org: ${organizationId}`
    );

    try {
      // Get organization and check AI settings
      const org = await this.organizationModel.findById(organizationId).lean();
      if (!org?.aiAgentSettings?.enabled) {
        this.logger.warn(
          `⚠️ [AI API Job] AI disabled for org ${organizationId}`
        );
        return {
          success: false,
          error: {
            type: "AI_DISABLED",
            message: "AI agent is disabled for this organization",
          },
        };
      }

      const { apiKey, endpoint } = org.aiAgentSettings;
      if (!apiKey) {
        this.logger.error(
          `❌ [AI API Job] No API key configured for org ${organizationId}`
        );
        return {
          success: false,
          error: {
            type: "NO_API_KEY",
            message: "No API key configured",
          },
        };
      }

      // Get conversation
      const conversation = await this.conversationModel
        .findById(conversationId)
        .lean();
      if (!conversation) {
        this.logger.error(
          `❌ [AI API Job] Conversation ${conversationId} not found`
        );
        return {
          success: false,
          error: {
            type: "CONVERSATION_NOT_FOUND",
            message: "Conversation not found",
          },
        };
      }

      // Get messages
      const messages = await this.messageModel
        .find({
          _id: { $in: messageIds },
          conversationId,
        })
        .lean();

      if (messages.length === 0) {
        this.logger.warn(`⚠️ [AI API Job] No messages found for job ${job.id}`);
        return {
          success: false,
          error: {
            type: "NO_MESSAGES",
            message: "No messages found",
          },
        };
      }

      // Get customer if available
      let customer = null;
      if (customerId) {
        customer = await this.customerModel.findById(customerId).lean();
      }

      // Build API endpoint
      const apiEndpoint = endpoint || "https://api.miagent.io/v1/chat-messages";

      // Use visitor's platformUserId as user identifier
      const userId = conversation.customerPlatformUserId || conversationId;

      // Combine messages
      const combinedData = MessageCombiner.combineMessages(
        messages.map((msg) => ({
          conversation: conversation as any,
          message: msg as any,
        }))
      );

      // Load chat history if needed
      const isCommentType = conversation.metadata?.type === "post_comments";
      if (!isCommentType && !conversation.aiChatHistorySent) {
        await this.loadChatHistory(combinedData, conversation as any);
      }

      // Create AI request
      const requestData = MessageCombiner.createAIRequest(
        combinedData,
        {
          username: customer?.name || conversation.customerName,
          _id: customer?._id?.toString() || userId,
        },
        customer
      );

      // Add conversation continuity
      const sharedAiConversationId = await this.getSharedAIConversationId(
        conversation as any
      );
      if (sharedAiConversationId) {
        requestData.conversation_id = sharedAiConversationId;
      }

      requestData.response_mode = "streaming";

      // Log request
      this.logger.log(
        `🤖 [AI API Job] Calling API | Conversation: ${conversationId} | ` +
          `Endpoint: ${apiEndpoint} | Query length: ${
            requestData.query?.length || 0
          } | ` +
          `Files: ${requestData.files?.length || 0}`
      );

      this.logger.debug(
        `🤖 [AI API Job] Query preview: "${requestData.query?.substring(
          0,
          100
        )}..."`
      );

      // Call AI API (single attempt - BullMQ handles retry)
      const callStartTime = Date.now();
      const response = await axios.post(apiEndpoint, requestData, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        responseType: "text",
        timeout: 60000, // 60s timeout
      });
      const callDuration = Date.now() - callStartTime;

      // Parse streaming response
      const rawData = response.data;
      const lines = rawData.split("\n");
      const chunks: any[] = [];
      let parseErrors = 0;

      for (const line of lines) {
        if (line.startsWith("data:")) {
          const jsonStr = line.substring(5).trim();
          if (jsonStr) {
            try {
              const parsed = JSON.parse(jsonStr);
              chunks.push(parsed);
            } catch (e) {
              parseErrors++;
              this.logger.warn(
                `⚠️ [AI API Job] JSON parse error: ${jsonStr.substring(
                  0,
                  100
                )}...`
              );
            }
          }
        }
      }

      if (parseErrors > 0) {
        this.logger.warn(
          `⚠️ [AI API Job] ${parseErrors} JSON parse errors in response`
        );
      }

      // Extract data
      const conversationChunk = chunks.find((item) => item.conversation_id);
      const aiConversationId = conversationChunk?.conversation_id || null;

      const agentMessages = chunks.filter(
        (item) => item.event === "agent_message"
      );
      const assembled = agentMessages.reduce(
        (acc, cur) => acc + (cur.answer || ""),
        ""
      );

      // Check if response is empty
      if (!assembled || assembled.trim().length === 0) {
        this.logger.error(
          `❌ [AI API Job] Empty response | Conversation: ${conversationId} | ` +
            `Chunks: ${chunks.length} | Agent messages: ${agentMessages.length}`
        );
        throw new Error(
          "Empty AI response - no agent messages found in streaming data"
        );
      }

      // Update conversation with AI conversation ID
      if (aiConversationId && !conversation.aiConversationId) {
        await this.conversationModel.findByIdAndUpdate(conversationId, {
          aiConversationId,
        });
      }

      const totalDuration = Date.now() - startTime;
      const totalTime = Date.now() - firstAttemptAt;

      this.logger.log(
        `✅ [AI API Job] Success | Job: ${job.id} | Conversation: ${conversationId} | ` +
          `Attempt: ${attempt} | Call: ${callDuration}ms | ` +
          `Job: ${totalDuration}ms | Total: ${totalTime}ms | ` +
          `Response: ${assembled.length} chars | Chunks: ${chunks.length} | ` +
          `AI Conv ID: ${aiConversationId || "N/A"}`
      );

      this.logger.debug(
        `✅ [AI API Job] Response preview: "${assembled.substring(0, 150)}..."`
      );

      return {
        success: true,
        answer: assembled,
        messageId: conversationChunk?.message_id,
        aiConversationId: aiConversationId || undefined,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const totalTime = Date.now() - firstAttemptAt;

      // Categorize error
      const aiError = categorizeAIError(error);

      this.logger.error(
        `❌ [AI API Job] Failed | Job: ${job.id} | Conversation: ${conversationId} | ` +
          `Attempt: ${attempt}/${job.opts.attempts || 1} | ` +
          `Duration: ${duration}ms | Total: ${totalTime}ms | ` +
          `Error Type: ${aiError.type} | ` +
          `Status: ${aiError.statusCode || "N/A"} | ` +
          `Retryable: ${aiError.retryable} | ` +
          `Message: ${aiError.message}`
      );

      // Log response data if available
      if (aiError.responseData) {
        this.logger.error(
          `❌ [AI API Job] Error Response: ${JSON.stringify(
            aiError.responseData
          ).substring(0, 500)}`
        );
      }

      // Log stack trace in debug mode
      if (error.stack) {
        this.logger.debug(`❌ [AI API Job] Stack trace: ${error.stack}`);
      }

      // Log actionable advice
      this.logErrorAdvice(aiError, organizationId, conversationId);

      // For non-retryable errors, mark job as failed (no retry)
      if (!aiError.retryable) {
        this.logger.error(
          `🚫 [AI API Job] Non-retryable error - job will fail | ` +
            `Job: ${job.id} | Error: ${aiError.type}`
        );

        // Return result to prevent BullMQ retry
        return {
          success: false,
          error: {
            type: aiError.type,
            message: aiError.message,
            statusCode: aiError.statusCode,
          },
        };
      }

      // For retryable errors, check if we should retry
      const maxAttempts = job.opts.attempts || 1;
      if (attempt < maxAttempts) {
        this.logger.warn(
          `⏳ [AI API Job] Will retry | Job: ${job.id} | ` +
            `Next attempt: ${attempt + 1}/${maxAttempts} | ` +
            `BullMQ will handle backoff automatically`
        );
      } else {
        this.logger.error(
          `🚫 [AI API Job] Max retries exceeded | Job: ${job.id} | ` +
            `Attempts: ${attempt} | Total time: ${totalTime}ms`
        );
      }

      // Throw error to trigger BullMQ retry
      throw error;
    }
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<AIAPICallJobData>, error: Error) {
    const { conversationId, organizationId } = job.data;
    const attempt = job.attemptsMade + 1;

    this.logger.error(
      `💥 [AI API Job] Job permanently failed | Job: ${job.id} | ` +
        `Conversation: ${conversationId} | Org: ${organizationId} | ` +
        `Attempts: ${attempt} | Error: ${error.message}`
    );
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job<AIAPICallJobData>, result: AIAPICallResult) {
    const { conversationId } = job.data;

    if (result.success) {
      this.logger.log(
        `🎉 [AI API Job] Job completed successfully | Job: ${job.id} | ` +
          `Conversation: ${conversationId}`
      );
    } else {
      this.logger.warn(
        `⚠️ [AI API Job] Job completed with error | Job: ${job.id} | ` +
          `Conversation: ${conversationId} | Error: ${result.error?.type}`
      );
    }
  }

  /**
   * Log actionable advice based on error type
   */
  private logErrorAdvice(
    error: AIAPIError,
    organizationId: string,
    conversationId: string
  ): void {
    switch (error.type) {
      case AIErrorType.AUTH_ERROR:
        this.logger.error(
          `💡 [AI API Advice] AUTH_ERROR - Check API key for org ${organizationId}. ` +
            `Key may be invalid, expired, or lack permissions.`
        );
        break;
      case AIErrorType.RATE_LIMIT_ERROR:
        this.logger.error(
          `💡 [AI API Advice] RATE_LIMIT_ERROR - Org ${organizationId} exceeded limits. ` +
            `Consider increasing batch delay or upgrading plan.`
        );
        break;
      case AIErrorType.VALIDATION_ERROR:
        this.logger.error(
          `💡 [AI API Advice] VALIDATION_ERROR - Invalid request payload. ` +
            `Check conversation ${conversationId} for unusual content.`
        );
        break;
      case AIErrorType.TIMEOUT_ERROR:
        this.logger.error(
          `💡 [AI API Advice] TIMEOUT_ERROR - API took too long. ` +
            `May indicate heavy load or complex query.`
        );
        break;
      case AIErrorType.NETWORK_ERROR:
        this.logger.error(
          `💡 [AI API Advice] NETWORK_ERROR - Cannot reach API endpoint. ` +
            `Check network connectivity and endpoint URL.`
        );
        break;
      case AIErrorType.SERVER_ERROR:
        this.logger.error(
          `💡 [AI API Advice] SERVER_ERROR - API server issues. ` +
            `Usually temporary, will retry automatically.`
        );
        break;
      default:
        this.logger.error(
          `💡 [AI API Advice] ${error.type} - Unexpected error. ` +
            `Review details and contact support if persists.`
        );
    }
  }

  /**
   * Get shared AI conversation ID
   */
  private async getSharedAIConversationId(
    conversation: ConversationDocument
  ): Promise<string | null> {
    if (conversation.aiConversationId) {
      return conversation.aiConversationId;
    }

    try {
      const existingConversation = await this.conversationModel
        .findOne({
          organizationId: conversation.organizationId,
          platformAccountId: conversation.platformAccountId,
          customerPlatformUserId: conversation.customerPlatformUserId,
          aiConversationId: { $exists: true, $ne: null },
        })
        .sort({ createdAt: 1 })
        .lean();

      return existingConversation?.aiConversationId || null;
    } catch (error) {
      this.logger.error("Error finding shared AI conversation:", error);
      return null;
    }
  }

  /**
   * Load chat history
   */
  private async loadChatHistory(
    combinedData: any,
    conversation: ConversationDocument
  ): Promise<boolean> {
    try {
      const oldMessages = await this.messageModel
        .find({
          organizationId: conversation.organizationId,
          conversationId: conversation._id,
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      if (oldMessages && oldMessages.length > 0) {
        const sortedMessages = oldMessages.reverse();
        const currentMessageContent = combinedData.texts[0]?.content;
        const historyMessages = sortedMessages.filter(
          (msg: any) =>
            msg.content?.text &&
            msg.content.text.trim() &&
            msg.content.text !== currentMessageContent
        );

        if (historyMessages.length > 0) {
          const chatHistory = historyMessages
            .map((msg: any) => {
              const sender =
                msg.direction === "OUTBOUND"
                  ? "Agent"
                  : msg.sender?.name || "Customer";
              return `${sender}: ${msg.content.text}`;
            })
            .join("\n");

          if (chatHistory && combinedData.texts.length > 0) {
            combinedData.texts[0].content =
              `[Previous conversation history]\n${chatHistory}\n\n[Current message]\n` +
              combinedData.texts[0].content;

            await this.conversationModel.findByIdAndUpdate(conversation._id, {
              aiChatHistorySent: true,
            });

            return true;
          }
        }
      }
    } catch (error) {
      this.logger.error("Error loading chat history:", error);
    }

    return false;
  }
}
