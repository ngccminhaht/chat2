import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  Platform,
  MessageDirection,
  MessageType,
  MessageStatus,
  ConversationStatus,
} from '@/common/constants';
import { WebsocketGateway } from './websocket.gateway';
import { VisitorGateway } from './visitor.gateway';
import { nanoid } from 'nanoid';
import { InboundMessageHandlerService } from '@/modules/messages/inbound-message-handler.service';

interface VisitorMessagePayload {
  sessionId: string;
  organizationId: string;
  visitorName?: string;
  visitorEmail?: string;
  text?: string;
  type?: string;
  mediaUrl?: string;
  fileName?: string;
}

interface VisitorInfo {
  name?: string;
  email?: string;
  phone?: string;
}

@Injectable()
export class VisitorMessageService {
  private readonly logger = new Logger(VisitorMessageService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @Inject(forwardRef(() => WebsocketGateway))
    private readonly websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => VisitorGateway))
    private readonly visitorGateway: VisitorGateway,
    private readonly inboundMessageHandler: InboundMessageHandlerService,
  ) {}

  /**
   * Process incoming message from visitor
   * Uses InboundMessageHandlerService for CRUD + AI batching
   */
  async processVisitorMessage(payload: VisitorMessagePayload) {
    const {
      sessionId,
      organizationId,
      visitorName,
      text,
      type,
      mediaUrl,
      fileName,
    } = payload;

    const conversationKey = `web_${organizationId}_${sessionId}`;
    const messageId = nanoid();

    // Process via shared handler (conversation CRUD + message save + AI batching)
    const result = await this.inboundMessageHandler.processInboundMessage({
      platform: Platform.WEB,
      organizationId,
      conversationKey,
      platformMessageId: messageId,
      direction: MessageDirection.INBOUND,
      type: (type as MessageType) || MessageType.TEXT,
      content: { text, mediaUrl, fileName },
      sender: { platformUserId: sessionId, name: visitorName || 'Visitor' },
      timestamp: new Date(),
      customerName: visitorName || `Visitor ${sessionId.substring(0, 8)}`,
      platformConnectionId: new Types.ObjectId().toString(), // Virtual for web
      platformAccountId: organizationId,
    });

    // Direct WebSocket notification (web-specific, keep here)
    const conversationIdStr = result.conversation._id.toString();
    const serializedMessage = JSON.parse(JSON.stringify(result.message.toObject()));
    const messagePayload = {
      conversationId: conversationIdStr,
      message: serializedMessage,
    };
    const conversationUpdatePayload = {
      _id: conversationIdStr,
      lastMessage: {
        text: text || '[Media]',
        timestamp: new Date(),
      },
      unreadCount: result.conversation.unreadCount + 1,
    };

    // Always broadcast to org agents room (admin/owner/agents who joined)
    this.websocketGateway.emitToOrgAgents(organizationId, 'message:new', messagePayload);
    this.websocketGateway.emitToOrgAgents(organizationId, 'conversation:updated', conversationUpdatePayload);

    // Also notify assigned agent directly (in case they haven't joined org room)
    const agentId = result.conversation.assignedTo?.toString();
    if (agentId) {
      this.websocketGateway.emitNewMessage(agentId, messagePayload);
      this.websocketGateway.emitConversationUpdated(agentId, conversationUpdatePayload);
    }

    this.logger.log(
      `Processed visitor message: ${result.message._id} in conversation ${conversationIdStr}`,
    );

    return {
      messageId: result.message._id.toString(),
      conversationId: conversationIdStr,
      timestamp: (result.message as any).createdAt || new Date(),
    };
  }

  /**
   * Get existing conversation for visitor session
   */
  async getExistingConversation(organizationId: string, sessionId: string) {
    const conversationKey = `web_${organizationId}_${sessionId}`;

    const conversation = await this.conversationModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      platform: Platform.WEB,
      platformConversationId: conversationKey,
    });

    if (!conversation) return null;

    // Load recent messages
    const messages = await this.messageModel
      .find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return {
      _id: conversation._id,
      messages: messages.reverse(),
    };
  }

  /**
   * Update visitor profile info
   */
  async updateVisitorInfo(
    organizationId: string,
    sessionId: string,
    info: VisitorInfo,
  ) {
    const conversationKey = `web_${organizationId}_${sessionId}`;

    await this.conversationModel.findOneAndUpdate(
      {
        organizationId: new Types.ObjectId(organizationId),
        platformConversationId: conversationKey,
      },
      {
        ...(info.name && { customerName: info.name }),
        'metadata.visitorEmail': info.email,
        'metadata.visitorPhone': info.phone,
      },
    );

    this.logger.log(`Updated visitor info for session ${sessionId}`);
  }

  /**
   * Send message from agent to visitor
   * Called by message send endpoint
   */
  async sendToVisitor(
    conversationId: string,
    agentId: string,
    agentName: string,
    content: { text?: string; mediaUrl?: string },
  ) {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation || conversation.platform !== Platform.WEB) {
      throw new Error('Conversation not found or not a web chat');
    }

    // Extract sessionId from platformConversationId
    // Format: web_{orgId}_{sessionId}
    // Note: sessionId may contain underscores (e.g., v_xxx), so we join remaining parts
    const parts = conversation.platformConversationId.split('_');
    const sessionId = parts.slice(2).join('_');

    // Create message
    const messageId = nanoid();
    const message = await this.messageModel.create({
      organizationId: conversation.organizationId,
      conversationId: conversation._id,
      platform: Platform.WEB,
      platformMessageId: messageId,
      direction: MessageDirection.OUTBOUND,
      type: content.mediaUrl ? MessageType.FILE : MessageType.TEXT,
      content: {
        text: content.text,
        mediaUrl: content.mediaUrl,
      },
      sender: {
        platformUserId: agentId,
        name: agentName,
      },
      status: MessageStatus.SENT,
    });

    // Update conversation (timestamps: true ensures updatedAt is updated for sorting)
    await this.conversationModel.findByIdAndUpdate(
      conversationId,
      {
        'lastMessage.text': content.text || '[Media]',
        'lastMessage.timestamp': new Date(),
        'lastMessage.senderId': agentId,
        'lastMessage.messageId': message._id,
        unreadCount: 0, // Reset unread when agent replies
      },
      { timestamps: true },
    );

    this.logger.log(
      `Agent ${agentId} sent message to visitor ${sessionId}: ${message._id}`,
    );

    // Payload for widget (expects { message: ServerMessage } format)
    const widgetPayload = {
      message: {
        _id: message._id.toString(),
        content: {
          text: content.text,
          mediaUrl: content.mediaUrl,
        },
        sender: {
          name: agentName,
          platformUserId: agentId,
        },
        direction: 'outbound' as const,
        createdAt: (message as any).createdAt?.toISOString() || new Date().toISOString(),
      },
    };

    // Emit message to visitor via WebSocket (widget listens to 'message:received')
    this.visitorGateway.emitToVisitor(sessionId, 'message:received', widgetPayload);
    this.logger.log(`📤 Emitted message:received to visitor ${sessionId}`);

    // Broadcast to org agents so other agents see the reply in real-time
    const organizationId = conversation.organizationId.toString();
    const convIdStr = conversation._id.toString();
    const serializedMsg = JSON.parse(JSON.stringify(message.toObject()));
    this.websocketGateway.emitToOrgAgents(organizationId, 'message:new', {
      conversationId: convIdStr,
      message: serializedMsg,
    });
    this.websocketGateway.emitToOrgAgents(organizationId, 'conversation:updated', {
      _id: convIdStr,
      lastMessage: {
        text: content.text || '[Media]',
        timestamp: new Date(),
      },
      unreadCount: 0,
    });

    // Return sessionId for any additional processing
    return {
      sessionId,
      message: message.toObject(),
    };
  }
}
