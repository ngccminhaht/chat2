import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { KAFKA_TOPICS, MessageStatus, MessageType } from '@/common/constants';
import {
  Message,
  MessageDocument,
  PlatformConnection,
  PlatformConnectionDocument,
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas';
import { PlatformRegistryService } from '@/common/platform';
import {
  OutgoingMessageEvent,
  WebSocketNotificationEvent,
} from '@/common/platform/types/kafka-events.type';
import { SendResult } from '@/common/platform/interfaces';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { getKafkaConfig, KAFKA_CONSUMER_GROUPS } from '@/infra/kafka/kafka.config';
import { EnvService } from '@/common/env';

/**
 * Outgoing Message Consumer
 * Consumes messages to be sent to platforms from Kafka
 *
 * Flow:
 * 1. Consume from messages.outgoing
 * 2. Get platform adapter
 * 3. Get credentials from platform connection
 * 4. Call appropriate sender method
 * 5. Update message status
 * 6. Publish WebSocket notification
 */
@Injectable()
export class OutgoingMessageConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutgoingMessageConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private isRunning = false;

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly platformRegistry: PlatformRegistryService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly envService: EnvService,
  ) {}

  async onModuleInit() {
    const config = getKafkaConfig(this.envService);
    this.kafka = new Kafka(config);

    this.consumer = this.kafka.consumer({
      groupId: KAFKA_CONSUMER_GROUPS.MESSAGE_SENDER,
    });

    try {
      await this.consumer.connect();
      this.logger.log('✅ Outgoing Message Consumer connected');

      await this.consumer.subscribe({
        topic: KAFKA_TOPICS.MESSAGES_OUTGOING,
        fromBeginning: false,
      });

      await this.startConsuming();
    } catch (error) {
      this.logger.error('❌ Failed to initialize Outgoing Message Consumer:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.isRunning) {
      await this.consumer.disconnect();
      this.logger.log('Outgoing Message Consumer disconnected');
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

    this.logger.log(`📤 Consuming from ${KAFKA_TOPICS.MESSAGES_OUTGOING}`);
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
      const outgoingEvent: OutgoingMessageEvent = JSON.parse(
        message.value.toString(),
      );

      this.logger.debug(
        `Processing outgoing message: ${outgoingEvent.messageId} [partition=${partition}]`,
      );

      await this.sendMessage(outgoingEvent);
    } catch (error) {
      this.logger.error(
        `Failed to process outgoing message: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send message to platform
   */
  private async sendMessage(event: OutgoingMessageEvent): Promise<void> {
    const {
      messageId,
      conversationId,
      platform,
      platformConnectionId,
      platformAccountId,
      recipientId,
      message,
      credentials,
    } = event;

    try {
      // Get platform adapter
      const adapter = this.platformRegistry.getAdapter(platform);

      // Prepare send parameters
      const baseParams = {
        recipientId,
        accessToken: credentials.accessToken,
        platformAccountId,
      };

      let result: SendResult;

      // Call appropriate sender method based on message type
      switch (message.type) {
        case MessageType.TEXT:
          result = await adapter.sender.sendText({
            ...baseParams,
            text: message.text || '',
          });
          break;

        case MessageType.IMAGE:
          result = await adapter.sender.sendImage({
            ...baseParams,
            imageUrl: message.mediaUrl || '',
          });
          break;

        case MessageType.FILE:
          result = await adapter.sender.sendFile({
            ...baseParams,
            fileUrl: message.mediaUrl || '',
            fileName: message.fileName,
          });
          break;

        case MessageType.STICKER:
          if (adapter.sender.sendSticker) {
            result = await adapter.sender.sendSticker({
              ...baseParams,
              stickerId: message.stickerId || '',
            });
          } else {
            result = {
              success: false,
              error: 'Sticker not supported by platform',
            };
          }
          break;

        default:
          result = {
            success: false,
            error: `Unsupported message type: ${message.type}`,
          };
      }

      // Update message status
      const newStatus = result.success ? MessageStatus.SENT : MessageStatus.FAILED;
      const updateData: Partial<Message> = {
        status: newStatus,
        platformMessageId: result.platformMessageId || undefined,
      };

      if (!result.success) {
        updateData.metadata = {
          error: result.error,
          rawResponse: result.rawResponse,
        };
      }

      await this.messageModel.updateOne(
        { _id: new Types.ObjectId(messageId) },
        { $set: updateData },
      );

      // Publish WebSocket notification for status update
      await this.publishStatusNotification(
        messageId,
        conversationId,
        newStatus,
        platformConnectionId,
        result.error,
      );

      if (result.success) {
        this.logger.debug(`Message sent successfully: ${messageId}`);
      } else {
        this.logger.warn(`Message failed: ${messageId} - ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Error sending message ${messageId}: ${error.message}`);

      // Update message as failed
      await this.messageModel.updateOne(
        { _id: new Types.ObjectId(messageId) },
        {
          $set: {
            status: MessageStatus.FAILED,
            'metadata.error': error.message,
          },
        },
      );

      // Publish failure notification
      await this.publishStatusNotification(
        messageId,
        conversationId,
        MessageStatus.FAILED,
        platformConnectionId,
        error.message,
      );
    }
  }

  /**
   * Publish WebSocket notification for message status update
   */
  private async publishStatusNotification(
    messageId: string,
    conversationId: string,
    status: MessageStatus,
    platformConnectionId: string,
    error?: string,
  ): Promise<void> {
    try {
      // Get the platform connection to find the user
      const connection = await this.platformConnectionModel.findById(
        platformConnectionId,
      );

      if (!connection?.userId) {
        this.logger.debug('No user associated with connection, skipping notification');
        return;
      }

      const notification: WebSocketNotificationEvent = {
        type: 'message:status',
        userId: connection.userId.toString(),
        payload: {
          messageId,
          conversationId,
          status,
          error,
        },
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: connection.userId.toString(),
        value: notification,
      });

      this.logger.debug(
        `Status notification published for message ${messageId}: ${status}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish status notification: ${error.message}`,
      );
    }
  }
}
