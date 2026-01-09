/**
 * AI Response Service
 * Calls external MiAgent API to generate AI responses
 *
 * API: https://api.miagent.io/v1/chat-messages
 */

import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
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
  Platform,
  MessageDirection,
  MessageType,
  MessageStatus,
} from "@/common/constants";
import { nanoid } from "nanoid";
import axios from "axios";
import {
  Customer,
  CustomerDocument,
} from "@/common/database/schemas/customer.schema";
import { MessageCombiner } from "@/modules/ai-agents/utils/message-combiner";
import { categorizeAIError } from "./ai-api-retry.config";

export interface AIResponseResult {
  answer: string;
  messageId?: string;
  conversationId?: string;
}

export interface AIRequestData {
  query: string;
  inputs?: Record<string, any>;
  response_mode: "blocking" | "streaming";
  user: string;
  conversation_id?: string;
  files?: Array<{ type: string; url: string }>;
}

interface MiAgentChatResponse {
  event: string;
  message_id: string;
  conversation_id: string;
  mode: string;
  answer: string;
  metadata?: {
    usage?: {
      total_tokens: number;
    };
  };
  created_at: number;
}

@Injectable()
export class AIResponseService {
  private readonly logger = new Logger(AIResponseService.name);

  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>
  ) {}

  /**
   * Generate AI response using MiAgent API
   * Supports streaming and conversation continuity
   */
  async generateResponse(
    conversationId: string,
    organizationId: string,
    messages: MessageDocument[],
    customer?: CustomerDocument | null
  ): Promise<AIResponseResult | null> {
    // Get organization AI settings
    const org = await this.organizationModel.findById(organizationId).lean();
    if (!org?.aiAgentSettings?.enabled) {
      this.logger.log(
        `⏭️ [AI API Call] AI agent disabled for org ${organizationId}`
      );
      return null;
    }

    const { apiKey, endpoint } = org.aiAgentSettings;
    if (!apiKey) {
      this.logger.warn(`No API key configured for org ${organizationId}`);
      return null;
    }

    // Get conversation to find visitor info
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      this.logger.warn(`Conversation ${conversationId} not found`);
      return null;
    }

    // Use visitor's platformUserId as user identifier
    const userId = conversation.customerPlatformUserId || conversationId;

    // Build API endpoint - default to MiAgent if not custom
    const apiEndpoint = endpoint || "https://api.miagent.io/v1/chat-messages";

    // Combine messages with MessageCombiner
    const combinedData = MessageCombiner.combineMessages(
      messages.map((msg) => ({
        conversation,
        message: msg,
      }))
    );

    // Load chat history if not sent before (for messaging, not comments)
    const isCommentType = conversation.metadata?.type === "post_comments";
    if (!isCommentType && !conversation.aiChatHistorySent) {
      await this.loadChatHistory(combinedData, conversation);
    }

    // Create AI request with customer info and files
    const requestData = MessageCombiner.createAIRequest(
      combinedData,
      {
        username: customer?.name || conversation.customerName,
        _id: customer?._id?.toString() || userId,
      },
      customer || null
    );

    // Add conversation continuity
    const sharedAiConversationId = await this.getSharedAIConversationId(
      conversation
    );
    if (sharedAiConversationId) {
      requestData.conversation_id = sharedAiConversationId;
    }

    // Use streaming for better UX
    requestData.response_mode = "streaming";

    // Log customer info being sent to AI
    this.logger.log(
      `📤 [AI Request] Customer Info:`,
      JSON.stringify(
        {
          customer_name: requestData.inputs?.customer_name,
          customer_gender: requestData.inputs?.customer_gender,
          customer_phone: requestData.inputs?.customer_phone,
          customer_email: requestData.inputs?.customer_email,
          customer_info: requestData.inputs?.customer_info,
        },
        null,
        2
      )
    );

    // Log request
    this.logger.log(
      `🤖 [AI API Call] Conversation: ${conversationId} | Org: ${organizationId} | ` +
        `Endpoint: ${apiEndpoint} | Query length: ${
          requestData.query?.length || 0
        } chars`
    );

    try {
      const startTime = Date.now();

      // Call AI API (single attempt - BullMQ queue will handle retry if needed)
      const response = await axios.post(apiEndpoint, requestData, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        responseType: "text",
        timeout: 60000, // 60s timeout
      });

      const duration = Date.now() - startTime;

      // Parse streaming response
      const rawData = response.data;
      const lines = rawData.split("\n");
      const chunks: any[] = [];

      for (const line of lines) {
        if (line.startsWith("data:")) {
          const jsonStr = line.substring(5).trim();
          if (jsonStr) {
            try {
              const parsed = JSON.parse(jsonStr);
              chunks.push(parsed);
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      }

      // Extract conversation ID
      const conversationChunk = chunks.find((item) => item.conversation_id);
      const aiConversationId = conversationChunk?.conversation_id || null;

      // Extract agent messages
      const agentMessages = chunks.filter(
        (item) => item.event === "agent_message"
      );
      const assembled = agentMessages.reduce(
        (acc, cur) => acc + (cur.answer || ""),
        ""
      );

      // Check if response is empty
      if (!assembled || assembled.trim().length === 0) {
        this.logger.warn(
          `⚠️ [AI API Call] Empty response for ${conversationId}`
        );
        return null;
      }

      // Update conversation with AI conversation ID
      if (aiConversationId && !conversation.aiConversationId) {
        await this.conversationModel.findByIdAndUpdate(conversationId, {
          aiConversationId,
        });
      }

      this.logger.log(
        `✅ [AI API Call] Success | Conversation: ${conversationId} | ` +
          `Duration: ${duration}ms | Response: ${assembled.length} chars`
      );

      return {
        answer: assembled,
        messageId: conversationChunk?.message_id,
        conversationId: aiConversationId || undefined,
      };
    } catch (error: any) {
      // Categorize error for better logging
      const aiError = categorizeAIError(error);

      this.logger.error(
        `❌ [AI API Call] Failed | Conversation: ${conversationId} | ` +
          `Error: ${aiError.type} | Status: ${aiError.statusCode || "N/A"} | ` +
          `Message: ${aiError.message}`
      );

      // Throw error - let caller decide retry strategy
      throw error;
    }
  }

  /**
   * Get shared AI conversation ID across conversations with same user
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
   * Load chat history and add to combined data
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
                msg.direction === MessageDirection.OUTBOUND
                  ? "Agent"
                  : msg.sender?.name || "Customer";
              return `${sender}: ${msg.content.text}`;
            })
            .join("\n");

          if (chatHistory && combinedData.texts.length > 0) {
            combinedData.texts[0].content = `[Previous conversation history]\n${chatHistory}\n\n[Current message]\n${combinedData.texts[0].content}`;

            // Mark as sent
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

  /**
   * Save AI response as outbound message
   * Works for all platforms (web, Facebook, Zalo, etc.)
   */
  async saveAIMessage(
    conversationId: string,
    answer: string
  ): Promise<{
    message: MessageDocument;
    sessionId?: string;
    organizationId: string;
  }> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Extract sessionId for web platform only
    let sessionId: string | undefined;
    if (conversation.platform === Platform.WEB) {
      // Format: web_{orgId}_{sessionId}
      const parts = conversation.platformConversationId.split("_");
      sessionId = parts.slice(2).join("_");
    }

    // Create AI message as outbound (from bot)
    const messageId = nanoid();
    const message = await this.messageModel.create({
      organizationId: conversation.organizationId,
      conversationId: conversation._id,
      platform: conversation.platform, // Use conversation's platform
      platformMessageId: messageId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEXT,
      content: { text: answer },
      sender: {
        platformUserId: "ai-agent",
        name: "AI Agent",
      },
      status: MessageStatus.PENDING, // Will be updated when actually sent
    });

    // Update conversation's lastMessage
    await this.conversationModel.findByIdAndUpdate(
      conversationId,
      {
        "lastMessage.text": answer,
        "lastMessage.timestamp": new Date(),
        "lastMessage.senderId": "ai-agent",
        "lastMessage.messageId": message._id,
        unreadCount: 0,
      },
      { timestamps: true }
    );

    return {
      message,
      sessionId,
      organizationId: conversation.organizationId.toString(),
    };
  }
}
