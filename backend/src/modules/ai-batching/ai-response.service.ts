/**
 * AI Response Service
 * Calls external MiAgent API to generate AI responses
 *
 * API: https://api.miagent.io/v1/chat-messages
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import { Platform, MessageDirection, MessageType, MessageStatus } from '@/common/constants';
import { nanoid } from 'nanoid';

export interface AIResponseResult {
  answer: string;
  messageId?: string;
  conversationId?: string;
}

interface MiAgentChatRequest {
  query: string;
  inputs?: Record<string, any>;
  response_mode: 'blocking' | 'streaming';
  user: string;
  conversation_id?: string;
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
  ) {}

  /**
   * Generate AI response using MiAgent API
   */
  async generateResponse(
    conversationId: string,
    organizationId: string,
    query: string,
  ): Promise<AIResponseResult | null> {
    // Get organization AI settings
    const org = await this.organizationModel.findById(organizationId).lean();
    if (!org?.aiAgentSettings?.enabled) {
      this.logger.debug(`AI agent disabled for org ${organizationId}`);
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
    const apiEndpoint = endpoint || 'https://api.miagent.io/v1/chat-messages';

    try {
      const requestBody: MiAgentChatRequest = {
        query,
        inputs: {},
        response_mode: 'blocking',
        user: userId,
        // Note: We could track AI conversation_id separately if we want continuity
      };

      this.logger.debug(
        `Calling AI API for conversation ${conversationId}: ${query.substring(0, 50)}...`,
      );

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `AI API error ${response.status}: ${errorText}`,
        );
        return null;
      }

      const data: MiAgentChatResponse = await response.json();

      this.logger.log(
        `AI response received for ${conversationId}: ${data.answer.substring(0, 50)}...`,
      );

      return {
        answer: data.answer,
        messageId: data.message_id,
        conversationId: data.conversation_id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to call AI API for ${conversationId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Save AI response as outbound message and return session info for WebSocket
   */
  async saveAIMessage(
    conversationId: string,
    answer: string,
  ): Promise<{ message: MessageDocument; sessionId: string; organizationId: string }> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Extract sessionId from platformConversationId (format: web_{orgId}_{sessionId})
    // Note: sessionId may contain underscores (e.g., v_xxx), so we join remaining parts
    const parts = conversation.platformConversationId.split('_');
    const sessionId = parts.slice(2).join('_');

    // Create AI message as outbound (from bot)
    const messageId = nanoid();
    const message = await this.messageModel.create({
      organizationId: conversation.organizationId,
      conversationId: conversation._id,
      platform: Platform.WEB,
      platformMessageId: messageId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEXT,
      content: { text: answer },
      sender: {
        platformUserId: 'ai-agent',
        name: 'AI Agent',
        type: 'bot',
      },
      status: MessageStatus.SENT,
    });

    // Update conversation's lastMessage
    await this.conversationModel.findByIdAndUpdate(
      conversationId,
      {
        'lastMessage.text': answer,
        'lastMessage.timestamp': new Date(),
        'lastMessage.senderId': 'ai-agent',
        'lastMessage.messageId': message._id,
        unreadCount: 0,
      },
      { timestamps: true },
    );

    return {
      message,
      sessionId,
      organizationId: conversation.organizationId.toString(),
    };
  }
}
