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

    // DISABLED: Chat history loading
    // When using conversation_id, AI API already has full conversation context
    // Loading history causes duplicates and sends old messages repeatedly
    // See loadChatHistory() method for details
    this.logger.log(
      `⏭️ [AI Response] Skipping chat history - AI has context via conversation_id`
    );

    // Create AI request with customer info and files
    const maxImages = org.aiAgentSettings?.maxImages || 3; // Get from org settings or default
    const requestData = MessageCombiner.createAIRequest(
      combinedData,
      {
        username: customer?.name || conversation.customerName,
        _id: customer?._id?.toString() || userId,
      },
      customer || null,
      maxImages
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
          miagent_conversation_id: requestData.inputs?.miagent_conversation_id,
        },
        null,
        2
      )
    );

    // Log messages being sent to AI for debugging
    this.logger.log(
      `📨 [AI API Call] Messages being sent to AI:`,
      JSON.stringify(
        messages.map((msg) => ({
          _id: msg._id.toString(),
          type: msg.type,
          direction: (msg as any).direction,
          text: (msg as any).content?.text?.substring(0, 100) || null,
          hasMediaUrl: !!(msg as any).content?.mediaUrl,
          mediaUrl: (msg as any).content?.mediaUrl?.substring(0, 100) || null,
          createdAt: (msg as any).createdAt,
        })),
        null,
        2
      )
    );

    // Log request
    this.logger.log(
      `🤖 [AI API Call] Conversation: ${conversationId} | Org: ${organizationId} | ` +
        `Endpoint: ${apiEndpoint} | Query length: ${
          requestData.query?.length || 0
        } chars | Has conversation_id: ${!!requestData.conversation_id} | ` +
        `Files: ${requestData.files?.length || 0} | Messages count: ${messages.length}`
    );

    // Log files detail for debugging
    if (requestData.files && requestData.files.length > 0) {
      this.logger.debug(
        `📎 [AI API Call] Files to send:`,
        JSON.stringify(
          requestData.files.map((f) => ({
            type: f.type,
            url: f.url?.substring(0, 100) + "...",
            transfer_method: f.transfer_method,
          })),
          null,
          2
        )
      );
    }

    // Log full request payload (for debugging)
    this.logger.debug(
      `🔍 [AI API Call] Full request payload:`,
      JSON.stringify(requestData, null, 2)
    );

    try {
      const startTime = Date.now();

      // Call AI API with retry logic for 404 errors
      let response;
      try {
        this.logger.log(
          `🚀 [AI API Call] Sending request to ${apiEndpoint} | ` +
            `API Key: ${apiKey?.substring(0, 10)}... | ` +
            `Payload size: ${JSON.stringify(requestData).length} chars`
        );
        response = await axios.post(apiEndpoint, requestData, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          responseType: "text",
          timeout: 60000, // 60s timeout
        });
        this.logger.log(
          `✅ [AI API Call] Response received | Status: ${response.status} | ` +
            `Response size: ${response.data?.length || 0} chars`
        );
      } catch (firstError: any) {
        // If 404 and we have conversation_id, retry without it
        if (
          firstError.response?.status === 404 &&
          requestData.conversation_id &&
          (firstError.response?.data?.includes("Conversation Not Exists") ||
            firstError.response?.data?.includes("not_found"))
        ) {
          this.logger.warn(
            `⚠️ [AI API Call] Conversation ${requestData.conversation_id} not found on AI server, retrying without conversation_id`
          );

          // Clear conversation_id and aiConversationId
          const originalConversationId = requestData.conversation_id;
          delete requestData.conversation_id;
          await this.conversationModel.findByIdAndUpdate(conversationId, {
            $unset: { aiConversationId: "" },
          });

          this.logger.log(
            `🔄 [AI API Call] Retrying without conversation_id (cleared ${originalConversationId})`
          );

          // Retry without conversation_id
          this.logger.log(
            `🔄 [AI API Call] Retrying request to ${apiEndpoint} without conversation_id`
          );
          response = await axios.post(apiEndpoint, requestData, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            responseType: "text",
            timeout: 60000,
          });
          this.logger.log(
            `✅ [AI API Call] Retry successful | Status: ${response.status} | ` +
              `Response size: ${response.data?.length || 0} chars`
          );
        } else {
          this.logger.error(
            `❌ [AI API Call] Request failed:`,
            firstError.response?.status,
            firstError.response?.data?.substring(0, 500) || firstError.message
          );
          throw firstError;
        }
      }

      const duration = Date.now() - startTime;

      // Parse streaming response
      const rawData = response.data;
      const lines = rawData.split("\n");
      const chunks: any[] = [];

      this.logger.debug(
        `🔍 [AI API Call] Parsing response | Total lines: ${lines.length} | ` +
          `Raw data length: ${rawData.length} chars`
      );

      for (const line of lines) {
        if (line.startsWith("data:")) {
          const jsonStr = line.substring(5).trim();
          if (jsonStr) {
            try {
              const parsed = JSON.parse(jsonStr);
              chunks.push(parsed);
            } catch (e) {
              this.logger.warn(
                `⚠️ [AI API Call] JSON parse error for line: ${jsonStr.substring(0, 100)}...`
              );
            }
          }
        }
      }

      this.logger.log(
        `📦 [AI API Call] Parsed chunks: ${chunks.length} | ` +
          `Duration: ${duration}ms`
      );

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

      this.logger.log(
        `💬 [AI API Call] Extracted response | ` +
          `Conversation ID: ${aiConversationId || "none"} | ` +
          `Agent message chunks: ${agentMessages.length} | ` +
          `Assembled length: ${assembled.length} chars | ` +
          `Preview: ${assembled.substring(0, 100)}${assembled.length > 100 ? "..." : ""}`
      );

      // Check if response is empty
      if (!assembled || assembled.trim().length === 0) {
        this.logger.warn(
          `⚠️ [AI API Call] Empty response for ${conversationId} | ` +
            `Total chunks: ${chunks.length} | ` +
            `Agent message chunks: ${agentMessages.length}`
        );
        this.logger.debug(
          `🔍 [AI API Call] All chunks:`,
          JSON.stringify(
            chunks.map((c) => ({
              event: c.event,
              hasAnswer: !!c.answer,
              answerLength: c.answer?.length || 0,
            })),
            null,
            2
          )
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

      // Log detailed error response
      if (error.response?.data) {
        this.logger.error(
          `❌ [AI API Call] Error response body:`,
          typeof error.response.data === "string"
            ? error.response.data
            : JSON.stringify(error.response.data, null, 2)
        );
      }

      // Log request body for debugging
      if (error.response?.status === 400) {
        this.logger.error(
          `❌ [AI API Call] Request body that caused 400:`,
          JSON.stringify(
            {
              query: requestData.query?.substring(0, 200),
              files: requestData.files,
              hasFiles: !!requestData.files?.length,
              filesCount: requestData.files?.length || 0,
            },
            null,
            2
          )
        );
      }

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
   * DEPRECATED - DO NOT USE
   * Chat history loading disabled because:
   * 1. AI API maintains full context via conversation_id
   * 2. Loading history causes duplicate messages
   * 3. Sends old human advisor messages repeatedly
   * 4. Messages get processed multiple times
   */
  // private async loadChatHistory(...) - REMOVED

  /**
   * Save AI response as outbound message
   * Works for all platforms (web, Facebook, Zalo, etc.)
   * Returns null if aiEnabled is false (user disabled AI during processing)
   */
  async saveAIMessage(
    conversationId: string,
    answer: string
  ): Promise<{
    message: MessageDocument;
    sessionId?: string;
    organizationId: string;
  } | null> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Check if AI is still enabled (may have been disabled while processing)
    if (conversation.aiEnabled === false) {
      this.logger.log(
        `⏭️ [AI Response] AI disabled for conversation ${conversationId} | ` +
        `Discarding response (not saving or sending)`
      );
      return null;
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
