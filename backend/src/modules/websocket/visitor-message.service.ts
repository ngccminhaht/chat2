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
import { AIBatchingService } from '@/modules/ai-batching/ai-batching.service';

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
    private readonly aiBatchingService: AIBatchingService,
  ) {}

  /**
   * Process incoming message from visitor
   */
  async processVisitorMessage(payload: VisitorMessagePayload) {
    const {
      sessionId,
      organizationId,
      visitorName,
      visitorEmail,
      text,
      type,
      mediaUrl,
      fileName,
    } = payload;

    // Get or create conversation
    const conversation = await this.getOrCreateConversation(
      organizationId,
      sessionId,
      visitorName,
    );

    // Create message
    const messageId = nanoid();
    const message = await this.messageModel.create({
      organizationId: new Types.ObjectId(organizationId),
      conversationId: conversation._id,
      platform: Platform.WEB,
      platformMessageId: messageId,
      direction: MessageDirection.INBOUND,
      type: type || MessageType.TEXT,
      content: {
        text,
        mediaUrl,
        fileName,
      },
      sender: {
        platformUserId: sessionId,
        name: visitorName || 'Visitor',
      },
      status: MessageStatus.DELIVERED,
    });

    // Update conversation lastMessage
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      'lastMessage.text': text || '[Media]',
      'lastMessage.timestamp': new Date(),
      'lastMessage.senderId': sessionId,
      'lastMessage.messageId': message._id,
      $inc: { unreadCount: 1 },
    });

    // Prepare notification payloads
    const messagePayload = {
      conversationId: conversation._id,
      message: message.toObject(),
    };
    const conversationUpdatePayload = {
      _id: conversation._id,
      lastMessage: {
        text: text || '[Media]',
        timestamp: new Date(),
      },
      unreadCount: conversation.unreadCount + 1,
    };

    // Always broadcast to org agents room (admin/owner/agents who joined)
    this.websocketGateway.emitToOrgAgents(organizationId, 'message:new', messagePayload);
    this.websocketGateway.emitToOrgAgents(organizationId, 'conversation:updated', conversationUpdatePayload);

    // Also notify assigned agent directly (in case they haven't joined org room)
    const agentId = conversation.assignedTo?.toString();
    if (agentId) {
      this.websocketGateway.emitNewMessage(agentId, messagePayload);
      this.websocketGateway.emitConversationUpdated(agentId, conversationUpdatePayload);
    }

    this.logger.log(
      `Processed visitor message: ${message._id} in conversation ${conversation._id}`,
    );

    // Trigger AI batching for inbound visitor messages
    await this.aiBatchingService.onVisitorMessage(message, conversation);

    return {
      messageId: message._id,
      conversationId: conversation._id,
      timestamp: (message as any).createdAt || new Date(),
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
   * Get or create conversation for visitor
   */
  private async getOrCreateConversation(
    organizationId: string,
    sessionId: string,
    visitorName?: string,
  ): Promise<ConversationDocument> {
    const conversationKey = `web_${organizationId}_${sessionId}`;

    let conversation = await this.conversationModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      platform: Platform.WEB,
      platformConversationId: conversationKey,
    });

    if (!conversation) {
      // Create web platform connection if not exists
      // For web, we use a virtual connection per org
      const virtualConnectionId = new Types.ObjectId();

      conversation = await this.conversationModel.create({
        organizationId: new Types.ObjectId(organizationId),
        platform: Platform.WEB,
        platformConversationId: conversationKey,
        platformConnectionId: virtualConnectionId, // Virtual for web
        platformAccountId: organizationId,
        customerPlatformUserId: sessionId,
        customerName: visitorName || `Visitor ${sessionId.substring(0, 8)}`,
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });

      this.logger.log(`Created new web conversation: ${conversation._id}`);
    }

    return conversation;
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
    const parts = conversation.platformConversationId.split('_');
    const sessionId = parts[2];

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

    // Update conversation
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      'lastMessage.text': content.text || '[Media]',
      'lastMessage.timestamp': new Date(),
      'lastMessage.senderId': agentId,
      'lastMessage.messageId': message._id,
      unreadCount: 0, // Reset unread when agent replies
    });

    this.logger.log(
      `Agent ${agentId} sent message to visitor ${sessionId}: ${message._id}`,
    );

    const messagePayload = {
      _id: message._id,
      conversationId: conversation._id,
      direction: MessageDirection.OUTBOUND,
      type: message.type,
      content: message.content,
      sender: message.sender,
      status: message.status,
      createdAt: (message as any).createdAt || new Date(),
    };

    // Emit message to visitor via WebSocket (widget listens to 'message:received')
    this.visitorGateway.emitToVisitor(sessionId, 'message:received', { message: messagePayload });
    this.logger.log(`📤 Emitted message to visitor ${sessionId}`);

    // Broadcast to org agents so other agents see the reply in real-time
    const organizationId = conversation.organizationId.toString();
    this.websocketGateway.emitToOrgAgents(organizationId, 'message:new', {
      conversationId: conversation._id,
      message: message.toObject(),
    });
    this.websocketGateway.emitToOrgAgents(organizationId, 'conversation:updated', {
      _id: conversation._id,
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
