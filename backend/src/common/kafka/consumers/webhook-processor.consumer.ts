import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Kafka, Consumer, EachMessagePayload } from "kafkajs";
import {
  Conversation,
  ConversationDocument,
} from "@/common/database/schemas/conversation.schema";
import {
  Message,
  MessageDocument,
} from "@/common/database/schemas/message.schema";
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from "@/common/database/schemas/platform-connection.schema";
import {
  getKafkaConfig,
  KAFKA_TOPICS,
  KAFKA_CONSUMER_GROUPS,
} from "../kafka.config";
import { WebhookRawEvent } from "../types/webhook.types";
import { KafkaProducerService } from "../kafka-producer.service";

/**
 * Webhook Processor Consumer
 * Consumes raw webhook events from Kafka and processes them:
 * 1. Normalize message content
 * 2. Save to MongoDB (conversations + messages)
 * 3. Publish to websocket.notifications topic
 */
@Injectable()
export class WebhookProcessorConsumer implements OnModuleInit {
  private readonly logger = new Logger(WebhookProcessorConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    private kafkaProducer: KafkaProducerService
  ) {}

  async onModuleInit() {
    const config = getKafkaConfig();
    this.kafka = new Kafka(config);
    this.consumer = this.kafka.consumer({
      groupId: KAFKA_CONSUMER_GROUPS.WEBHOOK_PROCESSOR,
    });

    await this.consumer.connect();
    this.logger.log("✅ Webhook Processor Consumer connected");

    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.WEBHOOKS_RAW,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.logger.log(`🎧 Listening to topic: ${KAFKA_TOPICS.WEBHOOKS_RAW}`);
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;

    try {
      const event: WebhookRawEvent = JSON.parse(
        message.value?.toString() || "{}"
      );

      this.logger.log(
        `📨 Processing webhook event: ${event.platform}/${event.eventName} (ID: ${event.eventId})`
      );

      // Route to appropriate platform handler
      switch (event.platform) {
        case "zalo":
          await this.processZaloWebhook(event);
          break;
        case "facebook":
          // TODO: Implement Facebook handler
          this.logger.warn("Facebook webhook processing not implemented yet");
          break;
        case "tiktok":
          // TODO: Implement TikTok handler
          this.logger.warn("TikTok webhook processing not implemented yet");
          break;
        case "shopee":
          // TODO: Implement Shopee handler
          this.logger.warn("Shopee webhook processing not implemented yet");
          break;
        default:
          this.logger.warn(`Unknown platform: ${event.platform}`);
      }
    } catch (error) {
      this.logger.error("Failed to process webhook event:", error);
      // Don't throw - let Kafka continue processing other messages
    }
  }

  /**
   * Process Zalo webhook events
   */
  private async processZaloWebhook(event: WebhookRawEvent): Promise<void> {
    const payload = event.payload;

    // Find or create platform connection
    let platformConnection = await this.platformConnectionModel
      .findOne({
        platform: "zalo",
        platformAccountId: event.platformAccountId,
      })
      .exec();

    if (!platformConnection) {
      this.logger.warn(
        `Platform connection not found for Zalo OA: ${event.platformAccountId}, creating placeholder`
      );

      platformConnection = await this.platformConnectionModel.create({
        platform: "zalo",
        platformAccountId: event.platformAccountId,
        platformAccountName: `Zalo OA ${event.platformAccountId.substring(
          0,
          8
        )}`,
        credentials: {
          accessToken: "placeholder",
          refreshToken: "placeholder",
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
        status: "pending",
        metadata: {
          createdFromWebhook: true,
          oaId: event.platformAccountId,
        },
        lastSyncAt: new Date(),
      });
    }

    const platformConnectionId = platformConnection._id.toString();

    // Route by event type
    switch (event.eventName) {
      case "user_send_text":
      case "user_send_image":
      case "user_send_video":
      case "user_send_file":
      case "user_send_audio":
      case "user_send_sticker":
      case "user_send_location":
        await this.handleZaloIncomingMessage(payload, platformConnectionId);
        break;

      case "user_received_message":
        await this.handleZaloMessageDelivery(payload);
        break;

      case "user_seen_message":
        await this.handleZaloMessageRead(payload);
        break;

      default:
        this.logger.warn(`Unhandled Zalo event: ${event.eventName}`);
    }
  }

  /**
   * Handle Zalo incoming message
   */
  private async handleZaloIncomingMessage(
    payload: any,
    platformConnectionId: string
  ): Promise<void> {
    if (!payload.message || !payload.sender) {
      this.logger.error("Invalid Zalo message payload");
      return;
    }

    const userId = payload.sender.id || payload.user_id_by_app;

    // Find or create conversation
    let conversation = await this.conversationModel
      .findOne({
        platform: "zalo",
        platformConversationId: userId,
      })
      .exec();

    if (conversation) {
      // Update platformConnectionId if changed (reconnect scenario)
      if (
        conversation.platformConnectionId.toString() !== platformConnectionId
      ) {
        this.logger.log(
          `Updating conversation ${conversation._id} to new connection ${platformConnectionId}`
        );
        conversation.platformConnectionId = new Types.ObjectId(
          platformConnectionId
        );
        await conversation.save();
      }
    } else {
      // Create new conversation
      conversation = await this.conversationModel.create({
        platform: "zalo",
        platformConversationId: userId,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        participants: [
          {
            platformUserId: userId,
            name: `Zalo User ${userId.substring(0, 8)}`,
            role: "customer",
          },
        ],
        status: "open",
        unreadCount: 0,
        metadata: {
          appId: payload.app_id,
        },
      });

      this.logger.log(`Created conversation: ${conversation._id}`);
    }

    // Normalize message content
    const normalized = this.normalizeZaloMessage(payload);

    // Create message
    const message = await this.messageModel.create({
      conversationId: conversation._id,
      platform: "zalo",
      platformMessageId: payload.message.msg_id,
      direction: "inbound",
      type: normalized.messageType,
      content: normalized.content,
      sender: {
        platformUserId: userId,
        name:
          conversation.participants[0]?.name ||
          `Zalo User ${userId.substring(0, 8)}`,
        avatar: conversation.participants[0]?.avatar,
      },
      status: "sent",
      metadata: {
        rawPayload: payload,
      },
    });

    this.logger.log(`✅ Message saved: ${message._id}`);

    // Update conversation
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: normalized.content.text || `[${normalized.messageType}]`,
        timestamp: new Date(parseInt(payload.timestamp)),
        senderId: userId,
        messageId: message._id,
      },
      $inc: { unreadCount: 1 },
    });

    // Publish WebSocket notification
    await this.publishWebSocketNotification(conversation, message);
  }

  /**
   * Normalize Zalo message content
   */
  private normalizeZaloMessage(payload: any): {
    messageType: string;
    content: any;
  } {
    const message = payload.message;

    // Text message
    if (message.text) {
      return {
        messageType: "text",
        content: { text: message.text },
      };
    }

    // Attachments
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];

      switch (attachment.type) {
        case "image":
          return {
            messageType: "image",
            content: {
              mediaUrl: attachment.payload.url,
              thumbnailUrl: attachment.payload.thumbnail,
            },
          };
        case "video":
          return {
            messageType: "video",
            content: {
              mediaUrl: attachment.payload.url,
              thumbnailUrl: attachment.payload.thumbnail,
            },
          };
        case "file":
          return {
            messageType: "file",
            content: {
              mediaUrl: attachment.payload.url,
              fileName: attachment.payload.name,
              fileSize: attachment.payload.size,
            },
          };
        case "audio":
          return {
            messageType: "audio",
            content: { mediaUrl: attachment.payload.url },
          };
        case "sticker":
          return {
            messageType: "sticker",
            content: { stickerId: attachment.payload.id },
          };
        case "location":
          return {
            messageType: "location",
            content: {
              latitude: attachment.payload.coordinates?.latitude,
              longitude: attachment.payload.coordinates?.longitude,
            },
          };
      }
    }

    throw new Error("Invalid Zalo message - no text or attachments");
  }

  /**
   * Handle Zalo message delivery status
   */
  private async handleZaloMessageDelivery(payload: any): Promise<void> {
    if (!payload.message) return;

    await this.messageModel.findOneAndUpdate(
      {
        platform: "zalo",
        platformMessageId: payload.message.msg_id,
      },
      { status: "delivered" }
    );

    this.logger.log(`Message ${payload.message.msg_id} delivered`);
  }

  /**
   * Handle Zalo message read status
   */
  private async handleZaloMessageRead(payload: any): Promise<void> {
    if (!payload.message) return;

    const message = await this.messageModel.findOneAndUpdate(
      {
        platform: "zalo",
        platformMessageId: payload.message.msg_id,
      },
      { status: "read" }
    );

    if (message) {
      await this.conversationModel.findByIdAndUpdate(message.conversationId, {
        unreadCount: 0,
      });

      this.logger.log(`Message ${payload.message.msg_id} read`);
    }
  }

  /**
   * Publish WebSocket notification to frontend
   */
  private async publishWebSocketNotification(
    conversation: ConversationDocument,
    message: MessageDocument
  ): Promise<void> {
    try {
      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: conversation._id.toString(),
        value: {
          type: "new_message",
          conversationId: conversation._id.toString(),
          payload: {
            message: {
              _id: message._id,
              conversationId: message.conversationId,
              type: message.type,
              content: message.content,
              sender: message.sender,
              status: message.status,
              createdAt: (message as any).createdAt, // timestamps field
            },
            conversation: {
              _id: conversation._id,
              unreadCount: conversation.unreadCount,
              lastMessage: conversation.lastMessage,
            },
          },
          timestamp: Date.now(),
        },
      });

      this.logger.log(
        `📤 Published WebSocket notification for conversation ${conversation._id}`
      );
    } catch (error) {
      this.logger.error("Failed to publish WebSocket notification:", error);
    }
  }
}
