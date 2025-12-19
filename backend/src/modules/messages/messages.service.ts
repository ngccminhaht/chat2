import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { GetMessagesDto } from './dto/get-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  MessageStatus,
  KAFKA_TOPICS,
  Platform,
  MessageType,
} from '@/common/constants';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import {
  OutgoingMessageEvent,
  WebSocketNotificationEvent,
  NewMessagePayload,
  ConversationUpdatedPayload,
  MessagesReadPayload,
} from '@/infra/kafka/types/webhook.types';
import { VisitorMessageService } from '@/modules/websocket/visitor-message.service';
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    private kafkaProducer: KafkaProducerService,
    @Inject(forwardRef(() => VisitorMessageService))
    private visitorMessageService: VisitorMessageService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
  ) {}

  /**
   * Find messages by conversation with org check
   */
  async findByConversation(
    organizationId: string,
    conversationId: string,
    dto: GetMessagesDto,
  ) {
    const { page = 1, limit = 50 } = dto;

    // Verify conversation exists and belongs to org
    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          conversationId: new Types.ObjectId(conversationId),
          organizationId: new Types.ObjectId(organizationId),
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.messageModel
        .countDocuments({
          conversationId: new Types.ObjectId(conversationId),
          organizationId: new Types.ObjectId(organizationId),
        })
        .exec(),
    ]);

    // Reverse to show oldest first
    return {
      data: messages.reverse(),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Send message via Kafka async flow (for platform conversations)
   * or directly via WebSocket (for web chat conversations)
   *
   * Flow for platforms (Zalo, Facebook, etc.):
   * 1. Create message with pending status
   * 2. Publish to messages.outgoing topic
   * 3. Return pending message (actual sending happens async)
   * 4. OutgoingMessageConsumer handles sending via platform adapter
   * 5. Consumer updates status and publishes WebSocket notification
   *
   * Flow for web chat:
   * 1. Create message via VisitorMessageService
   * 2. Emit directly to visitor via WebSocket
   * 3. Return sent message
   */
  async send(organizationId: string, userId: string, dto: SendMessageDto) {
    const { conversationId, type, content } = dto;

    // Verify conversation exists and belongs to org
    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Handle web chat conversations differently - they don't have platform connections
    if (conversation.platform === Platform.WEB) {
      return this.sendWebMessage(organizationId, userId, conversation, content);
    }

    // Get platform connection for access token (also verify org)
    const platformConnection = await this.platformConnectionModel
      .findOne({
        _id: conversation.platformConnectionId,
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!platformConnection) {
      throw new NotFoundException('Platform connection not found');
    }

    this.logger.log(`📧 Queuing message for conversation: ${conversationId}`);
    this.logger.log(`  Platform: ${conversation.platform}`);
    this.logger.log(`  Customer: ${conversation.customerPlatformUserId}`);

    // Sender info for outbound message (agent/system)
    const senderInfo = {
      platformUserId: platformConnection.platformAccountId || 'system',
      name: platformConnection.platformAccountName || 'Agent',
      avatar: platformConnection.metadata?.avatar,
    };

    // Create message with pending status (include organizationId)
    const message = await this.messageModel.create({
      organizationId: new Types.ObjectId(organizationId),
      conversationId: new Types.ObjectId(conversationId),
      platform: conversation.platform,
      platformMessageId: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      direction: 'outbound',
      type,
      content,
      sender: senderInfo,
      status: MessageStatus.PENDING,
      metadata: {
        sentByUserId: userId,
      },
    });

    // Build outgoing message event for Kafka
    const outgoingEvent: OutgoingMessageEvent = {
      messageId: message._id.toString(),
      conversationId: conversation._id.toString(),
      platform: conversation.platform as Platform,
      platformConnectionId: platformConnection._id.toString(),
      platformAccountId: platformConnection.platformAccountId,
      recipientId: conversation.customerPlatformUserId,
      message: {
        type: type as MessageType,
        text: content.text,
        mediaUrl: content.mediaUrl || content.url || content.attachments?.[0]?.url,
        mediaType: content.mediaType || content.attachments?.[0]?.type,
        fileName: content.fileName || content.attachments?.[0]?.name,
        stickerId: content.stickerId || content.attachments?.[0]?.stickerId,
      },
      credentials: {
        accessToken: platformConnection.credentials.accessToken,
      },
      timestamp: Date.now(),
    };

    // Publish to Kafka for async processing
    try {
      await this.kafkaProducer.publish(KAFKA_TOPICS.MESSAGES_OUTGOING, {
        key: conversationId, // Partition by conversation for ordering
        value: outgoingEvent,
      });

      this.logger.log(`📤 Published to ${KAFKA_TOPICS.MESSAGES_OUTGOING}: ${message._id}`);
    } catch (error) {
      this.logger.error(`Failed to publish outgoing message: ${error.message}`);

      // Update message status to failed
      message.status = MessageStatus.FAILED;
      message.metadata = {
        ...message.metadata,
        error: `Failed to queue message: ${error.message}`,
      };
      await message.save();

      throw new BadRequestException('Failed to queue message for sending');
    }

    // Immediately publish pending message to WebSocket so UI shows it
    if (platformConnection.connectedBy) {
      await this.publishPendingMessageNotification(
        platformConnection.connectedBy.toString(),
        conversation,
        message,
      );
    }

    return message;
  }

  /**
   * Send message for web chat conversations
   * Uses VisitorMessageService to handle direct WebSocket delivery
   */
  private async sendWebMessage(
    organizationId: string,
    userId: string,
    conversation: ConversationDocument,
    content: { text?: string; mediaUrl?: string; [key: string]: any },
  ) {
    this.logger.log(`📧 Sending web message for conversation: ${conversation._id}`);
    this.logger.log(`  Visitor: ${conversation.customerPlatformUserId}`);

    // Use VisitorMessageService to send and emit via WebSocket
    const result = await this.visitorMessageService.sendToVisitor(
      conversation._id.toString(),
      userId,
      'Agent', // Agent name - could be fetched from user service
      { text: content.text, mediaUrl: content.mediaUrl },
    );

    this.logger.log(`📤 Web message sent: ${result.message._id}`);

    return result.message;
  }

  async updateStatus(messageId: string, status: string) {
    return this.messageModel
      .findByIdAndUpdate(messageId, { status }, { new: true })
      .exec();
  }

  async updatePlatformMessageId(messageId: string, platformMessageId: string) {
    return this.messageModel
      .findByIdAndUpdate(messageId, { platformMessageId }, { new: true })
      .exec();
  }

  async markAsRead(
    organizationId: string,
    conversationId: string,
    _userId: string,
  ) {
    // Verify conversation exists and belongs to org
    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
      })
      .populate('platformConnectionId')
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Get userId from platform connection, fallback to authenticated user
    const platformConnection = conversation.platformConnectionId as any;
    const connectionUserId = platformConnection?.connectedBy?.toString() || _userId;

    // Find all inbound messages that are not read yet
    const messagesToUpdate = await this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        direction: 'inbound',
        status: { $ne: MessageStatus.READ },
      })
      .exec();

    if (messagesToUpdate.length === 0) {
      return { updated: 0, messages: [] };
    }

    // Update all messages to 'read' status
    const messageIds = messagesToUpdate.map((m) => m._id);
    await this.messageModel.updateMany(
      { _id: { $in: messageIds } },
      { status: MessageStatus.READ },
    ).exec();

    // Get updated messages
    const updatedMessages = await this.messageModel
      .find({ _id: { $in: messageIds } })
      .lean()
      .exec();

    this.logger.log(`Marked ${updatedMessages.length} messages as read in conversation ${conversationId}`);

    // Reset conversation unread count to 0
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      unreadCount: 0,
    }).exec();

    // Get updated conversation
    const updatedConversation = await this.conversationModel
      .findById(conversationId)
      .lean()
      .exec();

    // Publish messages read event to Kafka
    const messagesReadEvent: WebSocketNotificationEvent = {
      type: 'message:read',
      userId: connectionUserId,
      payload: {
        conversationId,
        messageIds: updatedMessages.map((m) => m._id.toString()),
      } as MessagesReadPayload,
      timestamp: Date.now(),
    };

    await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
      key: connectionUserId,
      value: messagesReadEvent,
    });

    // Publish conversation update to Kafka
    if (updatedConversation) {
      const conversationEvent: WebSocketNotificationEvent = {
        type: 'conversation:updated',
        userId: connectionUserId,
        payload: {
          _id: updatedConversation._id.toString(),
          unreadCount: updatedConversation.unreadCount,
          lastMessage: updatedConversation.lastMessage,
        } as ConversationUpdatedPayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: connectionUserId,
        value: conversationEvent,
      });
    }

    this.logger.log(`📤 Published Kafka events for user ${connectionUserId}`);

    return {
      updated: updatedMessages.length,
      messages: updatedMessages,
    };
  }

  /**
   * Publish pending message notification to WebSocket
   * This shows the message immediately in UI with 'pending' status
   * Also broadcasts to all org agents so they see the message in real-time
   */
  private async publishPendingMessageNotification(
    userId: string,
    conversation: ConversationDocument,
    message: MessageDocument,
  ): Promise<void> {
    try {
      const messagePayload = {
        _id: message._id.toString(),
        conversationId: message.conversationId.toString(),
        platform: message.platform,
        direction: message.direction,
        type: message.type,
        content: message.content,
        sender: message.sender,
        status: message.status,
        createdAt: new Date(),
      };

      // Broadcast to all org agents so everyone sees the new message
      const organizationId = conversation.organizationId?.toString();
      if (organizationId) {
        this.websocketGateway.emitToOrgAgents(organizationId, 'message:new', {
          conversationId: conversation._id.toString(),
          message: messagePayload,
        });
      }

      // Also publish via Kafka to specific user (for backward compatibility)
      const newMessageEvent: WebSocketNotificationEvent = {
        type: 'message:new',
        userId,
        payload: messagePayload as NewMessagePayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: userId,
        value: newMessageEvent,
      });

      this.logger.log(`📤 Published pending message notification for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to publish pending message notification:', error);
    }
  }
}
