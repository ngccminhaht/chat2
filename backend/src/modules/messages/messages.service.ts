import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from '@/common/database/schemas/message.schema';
import { Conversation, ConversationDocument } from '@/common/database/schemas/conversation.schema';
import { PlatformConnection, PlatformConnectionDocument } from '@/common/database/schemas/platform-connection.schema';
import { GetMessagesDto } from './dto/get-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { FacebookService } from '@/modules/facebook/facebook.service';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import {
  WebSocketNotificationEvent,
  NewMessagePayload,
  ConversationUpdatedPayload,
  MessagesReadPayload,
} from '@/infra/kafka/types/webhook.types';

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
    private facebookService: FacebookService,
    private kafkaProducer: KafkaProducerService,
  ) {}

  async findByConversation(
    conversationId: string,
    dto: GetMessagesDto,
  ) {
    const { page = 1, limit = 50 } = dto;

    // Verify conversation exists
    const conversation = await this.conversationModel
      .findById(conversationId)
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ conversationId: new Types.ObjectId(conversationId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.messageModel
        .countDocuments({ conversationId: new Types.ObjectId(conversationId) })
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

  async send(userId: string, dto: SendMessageDto) {
    const { conversationId, type, content } = dto;

    // Verify conversation exists
    const conversation = await this.conversationModel
      .findById(conversationId)
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Find customer info from participants (recipient of message)
    const customer = conversation.participants.find((p) => p.role === 'customer');
    if (!customer) {
      throw new BadRequestException('No customer found in conversation');
    }

    // Get platform connection for access token (optional for now)
    const platformConnection = await this.platformConnectionModel
      .findById(conversation.platformConnectionId)
      .exec();

    if (!platformConnection) {
      throw new NotFoundException('Platform connection not found');
    }

    // Get sender info - prefer agent from conversation participants
    const agent = conversation.participants.find((p) => p.role === 'agent');
    const senderInfo = {
      platformUserId: agent?.platformUserId || platformConnection.platformAccountId || 'system',
      name: agent?.name || platformConnection.platformAccountName || 'Agent',
      avatar: agent?.avatar || platformConnection.metadata?.avatar,
    };

    // Create message with pending status
    const message = await this.messageModel.create({
      conversationId: new Types.ObjectId(conversationId),
      platform: conversation.platform,
      platformMessageId: `temp_${Date.now()}_${Math.random()}`, // Will be updated after platform API call
      direction: 'outbound',
      type,
      content,
      sender: senderInfo,
      status: 'pending',
      metadata: {
        sentByUserId: userId,
      },
    });

    try {
      // Send message to platform
      if (conversation.platform === 'zalo') {
        // TODO: Implement Zalo send message functionality in ZaloService
        throw new BadRequestException('Zalo send message not yet implemented');
      } else if (conversation.platform === 'facebook') {
        if (type !== 'text') {
          throw new BadRequestException('Only text messages are supported for Facebook');
        }

        this.logger.log('=== Sending Facebook message ===');
        this.logger.log(`  Recipient platformUserId: ${customer.platformUserId}`);
        this.logger.log(`  Platform connection: ${platformConnection._id}`);
        this.logger.log(`  Message content: ${content.text?.substring(0, 50)}...`);

        // Get page access token from platform connection
        const pageAccessToken = platformConnection.credentials.accessToken;

        // Send message via Facebook API
        const result = await this.facebookService.sendTextMessage(
          pageAccessToken,
          customer.platformUserId,
          content.text,
        );

        // Update message with actual platform message ID and status
        message.platformMessageId = result.message_id;
        message.status = 'sent';
        await message.save();

        // Update conversation's last message
        await this.conversationModel.findByIdAndUpdate(conversationId, {
          lastMessage: {
            text: content.text,
            timestamp: new Date(),
            senderId: platformConnection.platformAccountId,
            messageId: message._id,
          },
        });

        this.logger.log(`✅ Message sent successfully: ${result.message_id}`);
      } else {
        throw new BadRequestException(`Platform ${conversation.platform} not supported yet`);
      }
    } catch (error) {
      this.logger.error('Failed to send message to platform:', error);

      // Update message status to failed
      message.status = 'failed';
      message.metadata = {
        ...message.metadata,
        error: error.message,
      };
      await message.save();

      // Publish failed message notification to Kafka
      await this.publishMessageNotification(platformConnection.userId.toString(), conversation, message);

      throw error;
    }

    // Publish successful message notification to Kafka
    await this.publishMessageNotification(platformConnection.userId.toString(), conversation, message);

    return message;
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

  async markAsRead(conversationId: string, userId: string) {
    // Verify conversation exists
    const conversation = await this.conversationModel
      .findById(conversationId)
      .populate('platformConnectionId')
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Get userId from platform connection
    const platformConnection = conversation.platformConnectionId as any;
    const connectionUserId = platformConnection?.userId?.toString();

    if (!connectionUserId) {
      this.logger.warn(`No userId found for conversation ${conversationId}`);
      throw new BadRequestException('Platform connection has no associated user');
    }

    // Find all inbound messages that are not read yet
    const messagesToUpdate = await this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        direction: 'inbound',
        status: { $ne: 'read' }, // Not equal to 'read'
      })
      .exec();

    if (messagesToUpdate.length === 0) {
      return { updated: 0, messages: [] };
    }

    // Update all messages to 'read' status
    const messageIds = messagesToUpdate.map((m) => m._id);
    await this.messageModel.updateMany(
      { _id: { $in: messageIds } },
      { status: 'read' },
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
   * Publish message and conversation notifications to Kafka
   */
  private async publishMessageNotification(
    userId: string,
    conversation: ConversationDocument,
    message: MessageDocument,
  ): Promise<void> {
    try {
      // Publish new message event
      const newMessageEvent: WebSocketNotificationEvent = {
        type: 'message:new',
        userId,
        payload: {
          _id: message._id.toString(),
          conversationId: message.conversationId.toString(),
          platform: message.platform,
          type: message.type,
          content: message.content,
          sender: message.sender,
          status: message.status,
          createdAt: (message as any).createdAt,
        } as NewMessagePayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: userId,
        value: newMessageEvent,
      });

      // Reload conversation to get updated lastMessage
      const updatedConversation = await this.conversationModel
        .findById(conversation._id)
        .lean()
        .exec();

      if (updatedConversation) {
        // Publish conversation updated event
        const conversationEvent: WebSocketNotificationEvent = {
          type: 'conversation:updated',
          userId,
          payload: {
            _id: updatedConversation._id.toString(),
            platform: updatedConversation.platform,
            unreadCount: updatedConversation.unreadCount,
            lastMessage: updatedConversation.lastMessage,
          } as ConversationUpdatedPayload,
          timestamp: Date.now(),
        };

        await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
          key: userId,
          value: conversationEvent,
        });
      }

      this.logger.log(`📤 Published message notifications to Kafka for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to publish message notification:', error);
    }
  }
}
