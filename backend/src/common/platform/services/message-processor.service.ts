import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import {
  KAFKA_TOPICS,
  MessageDirection,
  MessageStatus,
  ConversationStatus,
} from '@/common/constants';
import {
  Conversation,
  ConversationDocument,
  Message,
  MessageDocument,
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas';
import { NormalizedIncomingMessage } from '../interfaces';
import {
  WebSocketNotificationEvent,
  NewMessagePayload,
  ConversationUpdatedPayload,
} from '../types/kafka-events.type';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { getKafkaConfig, KAFKA_CONSUMER_GROUPS } from '@/infra/kafka/kafka.config';
import { EnvService } from '@/common/env';

/**
 * Message Processor Service
 * Consumes normalized messages from Kafka and persists them to MongoDB
 *
 * Flow:
 * 1. Consume from messages.incoming
 * 2. Find platform connection
 * 3. Find or create conversation
 * 4. Save message to database
 * 5. Update conversation lastMessage
 * 6. Publish WebSocket notification
 */
@Injectable()
export class MessageProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageProcessorService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private isRunning = false;

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly envService: EnvService,
  ) {}

  async onModuleInit() {
    const config = getKafkaConfig(this.envService);
    this.kafka = new Kafka(config);

    this.consumer = this.kafka.consumer({
      groupId: `${KAFKA_CONSUMER_GROUPS.WEBHOOK_PROCESSOR}-messages`,
    });

    try {
      await this.consumer.connect();
      this.logger.log('✅ Message Processor connected');

      await this.consumer.subscribe({
        topic: KAFKA_TOPICS.MESSAGES_INCOMING,
        fromBeginning: false,
      });

      await this.startConsuming();
    } catch (error) {
      this.logger.error('❌ Failed to initialize Message Processor:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.isRunning) {
      await this.consumer.disconnect();
      this.logger.log('Message Processor disconnected');
    }
  }

  /**
   * Start consuming messages
   */
  private async startConsuming(): Promise<void> {
    this.isRunning = true;

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.logger.log(`📥 Consuming from ${KAFKA_TOPICS.MESSAGES_INCOMING}`);
  }

  /**
   * Handle a single message from Kafka
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { partition, message } = payload;

    if (!message.value) {
      this.logger.warn('Received empty message');
      return;
    }

    try {
      const normalizedMessage: NormalizedIncomingMessage = JSON.parse(
        message.value.toString(),
      );

      // Parse timestamp back to Date if it was serialized as string
      if (typeof normalizedMessage.timestamp === 'string') {
        normalizedMessage.timestamp = new Date(normalizedMessage.timestamp);
      }

      this.logger.debug(
        `Processing message: ${normalizedMessage.platform}:${normalizedMessage.platformMessageId} [partition=${partition}]`,
      );

      await this.processIncomingMessage(normalizedMessage);
    } catch (error) {
      this.logger.error(
        `Failed to process message: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Process a normalized incoming message
   */
  async processIncomingMessage(
    normalizedMessage: NormalizedIncomingMessage,
  ): Promise<void> {
    const { platform, platformAccountId, platformMessageId } = normalizedMessage;

    // 1. Find platform connection
    const connection = await this.findPlatformConnection(
      platform,
      platformAccountId,
    );

    if (!connection) {
      this.logger.warn(
        `No connection found for ${platform}:${platformAccountId}`,
      );
      return;
    }

    // 2. Check for duplicate message
    const existingMessage = await this.messageModel.findOne({
      platform,
      platformMessageId,
    });

    if (existingMessage) {
      this.logger.debug(`Duplicate message ignored: ${platformMessageId}`);
      return;
    }

    // 3. Find or create conversation
    const conversation = await this.findOrCreateConversation(
      normalizedMessage,
      connection,
    );

    // 4. Save message
    const savedMessage = await this.saveMessage(normalizedMessage, conversation);

    // 5. Update conversation lastMessage
    await this.updateConversationLastMessage(conversation, savedMessage);

    // 6. Publish WebSocket notification
    if (connection.userId) {
      await this.publishNotification(
        connection.userId.toString(),
        conversation,
        savedMessage,
      );
    }

    this.logger.debug(
      `Message processed: ${savedMessage._id} in conversation ${conversation._id}`,
    );
  }

  /**
   * Find platform connection by platform and account ID
   */
  private async findPlatformConnection(
    platform: string,
    platformAccountId: string,
  ): Promise<PlatformConnectionDocument | null> {
    return this.platformConnectionModel.findOne({
      platform,
      platformAccountId,
      status: { $ne: 'inactive' },
    });
  }

  /**
   * Find or create conversation for the message
   */
  private async findOrCreateConversation(
    message: NormalizedIncomingMessage,
    connection: PlatformConnectionDocument,
  ): Promise<ConversationDocument> {
    let conversation = await this.conversationModel.findOne({
      platform: message.platform,
      platformConversationId: message.platformConversationId,
      platformConnectionId: connection._id,
    });

    if (!conversation) {
      conversation = await this.conversationModel.create({
        platform: message.platform,
        platformConversationId: message.platformConversationId,
        platformConnectionId: connection._id,
        platformAccountId: message.platformAccountId,
        customerPlatformUserId: message.sender.platformUserId,
        customerName: message.sender.name || 'Unknown',
        customerAvatar: message.sender.avatar,
        status: ConversationStatus.OPEN,
        unreadCount: 1,
        metadata: {},
      });

      this.logger.debug(`Created new conversation: ${conversation._id}`);
    } else {
      // Update customer info if changed
      const setUpdates: Partial<Conversation> = {};

      if (message.sender.name && message.sender.name !== conversation.customerName) {
        setUpdates.customerName = message.sender.name;
      }
      if (message.sender.avatar && message.sender.avatar !== conversation.customerAvatar) {
        setUpdates.customerAvatar = message.sender.avatar;
      }

      await this.conversationModel.updateOne(
        { _id: conversation._id },
        {
          $inc: { unreadCount: 1 },
          ...(Object.keys(setUpdates).length > 0 ? { $set: setUpdates } : {}),
        },
      );
    }

    return conversation;
  }

  /**
   * Save message to database
   */
  private async saveMessage(
    message: NormalizedIncomingMessage,
    conversation: ConversationDocument,
  ): Promise<MessageDocument> {
    return this.messageModel.create({
      conversationId: conversation._id,
      platform: message.platform,
      platformMessageId: message.platformMessageId,
      direction: MessageDirection.INBOUND,
      type: message.message.type,
      content: {
        text: message.message.text,
        mediaUrl: message.message.media?.url,
        mediaType: message.message.media?.type,
        thumbnailUrl: message.message.media?.thumbnailUrl,
        fileName: message.message.media?.fileName,
        fileSize: message.message.media?.fileSize,
        stickerId: message.message.sticker?.stickerId,
        location: message.message.location,
      },
      sender: message.sender,
      status: MessageStatus.DELIVERED,
      metadata: {
        rawPayload: message.rawPayload,
      },
    });
  }

  /**
   * Update conversation's lastMessage field
   */
  private async updateConversationLastMessage(
    conversation: ConversationDocument,
    message: MessageDocument,
  ): Promise<void> {
    const messageText = this.getMessagePreviewText(message);

    await this.conversationModel.updateOne(
      { _id: conversation._id },
      {
        lastMessage: {
          text: messageText,
          timestamp: new Date(),
          senderId: message.sender.platformUserId,
          messageId: message._id,
        },
        status: ConversationStatus.OPEN,
      },
    );
  }

  /**
   * Get preview text for message (for conversation list)
   */
  private getMessagePreviewText(message: MessageDocument): string {
    if (message.content.text) {
      return message.content.text.substring(0, 100);
    }

    switch (message.type) {
      case 'image':
        return '[Image]';
      case 'video':
        return '[Video]';
      case 'audio':
        return '[Audio]';
      case 'file':
        return `[File: ${message.content.fileName || 'Attachment'}]`;
      case 'sticker':
        return '[Sticker]';
      case 'location':
        return '[Location]';
      default:
        return '[Message]';
    }
  }

  /**
   * Publish WebSocket notification for new message
   */
  private async publishNotification(
    userId: string,
    conversation: ConversationDocument,
    message: MessageDocument,
  ): Promise<void> {
    try {
      // New message notification
      const newMessagePayload: NewMessagePayload = {
        conversationId: conversation._id.toString(),
        message: {
          id: message._id.toString(),
          platformMessageId: message.platformMessageId,
          type: message.type,
          content: {
            text: message.content.text,
            mediaUrl: message.content.mediaUrl,
            mediaType: message.content.mediaType,
          },
          sender: message.sender,
          createdAt: new Date(),
        },
      };

      const notification: WebSocketNotificationEvent = {
        type: 'message:new',
        userId,
        payload: newMessagePayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: userId,
        value: notification,
      });

      // Conversation updated notification
      const conversationUpdatedPayload: ConversationUpdatedPayload = {
        conversationId: conversation._id.toString(),
        lastMessage: {
          text: this.getMessagePreviewText(message),
          timestamp: new Date(),
          senderId: message.sender.platformUserId,
        },
        unreadCount: (conversation.unreadCount || 0) + 1,
      };

      const conversationNotification: WebSocketNotificationEvent = {
        type: 'conversation:updated',
        userId,
        payload: conversationUpdatedPayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: userId,
        value: conversationNotification,
      });

      this.logger.debug(`WebSocket notification published for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to publish WebSocket notification: ${error.message}`,
      );
    }
  }
}
