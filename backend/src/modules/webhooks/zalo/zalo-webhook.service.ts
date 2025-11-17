import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { createHmac } from "crypto";
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
import { ZaloWebhookDto, ZaloUserInfo } from "./dto/zalo-webhook.dto";

@Injectable()
export class ZaloWebhookService {
  private readonly logger = new Logger(ZaloWebhookService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>
  ) {}

  /**
   * Verify Zalo webhook signature
   */
  verifySignature(data: string, signature: string, appSecret: string): boolean {
    const hmac = createHmac("sha256", appSecret);
    hmac.update(data);
    const calculatedSignature = hmac.digest("hex");
    return calculatedSignature === signature;
  }

  /**
   * Process incoming Zalo webhook event
   * If platformConnectionId is not provided, it will be auto-found from payload.app_id
   */
  async processWebhook(
    payload: ZaloWebhookDto,
    platformConnectionId?: string
  ): Promise<void> {
    const senderId = payload.sender?.id || 'unknown';
    this.logger.log(
      `Processing Zalo webhook event: ${payload.event_name} from sender ${senderId}`
    );

    // Auto-find platformConnectionId from OA ID if not provided
    if (!platformConnectionId) {
      this.logger.log(
        `=== Webhook: Looking for platform connection for OA ID: ${payload.app_id} ===`
      );

      let connection = await this.platformConnectionModel
        .findOne({
          platform: "zalo",
          platformAccountId: payload.app_id,
        })
        .exec();

      if (!connection) {
        this.logger.error(
          `❌ Platform connection NOT FOUND for Zalo OA ID: ${payload.app_id}`
        );
        this.logger.error(
          `User must connect this OA via OAuth before receiving messages!`
        );
        throw new Error(
          `Platform connection not found for OA ${payload.app_id}. Please connect your Zalo OA first.`
        );
      }

      // Connection found - log its state
      this.logger.log(
        `✅ Found existing platform connection: ${connection._id}`
      );
      this.logger.log(`  Status: ${connection.status}`);
      this.logger.log(`  User ID: ${connection.userId || "NOT SET"}`);
      this.logger.log(
        `  Refresh Token: ${connection.credentials?.refreshToken?.substring(
          0,
          30
        )}... (is placeholder: ${
          connection.credentials?.refreshToken === "placeholder"
        })`
      );
      this.logger.log(
        `  Created from webhook: ${
          connection.metadata?.createdFromWebhook || false
        }`
      );

      // Validate connection has real tokens
      if (connection.credentials?.refreshToken === "placeholder") {
        this.logger.error(
          `❌ Connection has PLACEHOLDER tokens! User must re-authenticate.`
        );
        // Don't throw error - still process incoming message, but warn
      }

      platformConnectionId = connection._id.toString();
      this.logger.log(
        `Using platform connection: ${platformConnectionId} for OA ID: ${payload.app_id}`
      );
    }

    switch (payload.event_name) {
      case "user_send_text":
      case "user_send_image":
      case "user_send_video":
      case "user_send_file":
      case "user_send_audio":
      case "user_send_sticker":
      case "user_send_location":
        await this.handleIncomingMessage(payload, platformConnectionId);
        break;

      case "user_received_message":
        await this.handleMessageDelivery(payload);
        break;

      case "user_seen_message":
        await this.handleMessageRead(payload);
        break;

      default:
        this.logger.warn(`Unhandled Zalo event: ${payload.event_name}`);
    }
  }

  /**
   * Handle incoming message from user
   */
  private async handleIncomingMessage(
    payload: ZaloWebhookDto,
    platformConnectionId: string
  ): Promise<void> {
    this.logger.log("payload ->", {
      hasMessage: !!payload.message,
      hasSender: !!payload.sender,
      payload: JSON.stringify(payload, null, 2),
    });

    // Get sender ID (global user ID across all OAs)
    const senderId = payload.sender?.id;
    // Get OA ID (which OA received this message)
    const oaId = payload.app_id;

    if (!senderId || typeof senderId !== 'string') {
      this.logger.error("Cannot process message: missing or invalid sender.id:", {
        hasSender: !!payload.sender,
        senderId: payload.sender?.id,
        senderIdType: typeof payload.sender?.id,
        payload: JSON.stringify(payload, null, 2),
      });
      return;
    }

    // Conversation is uniquely identified by (senderId, oaId)
    // Because one user can message multiple OAs
    const conversationKey = `${senderId}_${oaId}`;

    this.logger.log(`Looking for conversation with key: ${conversationKey}`);

    // Find conversation by composite key
    // Don't filter by platformConnectionId to handle reconnect scenarios
    let conversation = await this.conversationModel
      .findOne({
        platform: "zalo",
        platformConversationId: conversationKey,
      })
      .exec();

    if (conversation) {
      // If conversation exists but has different platformConnectionId,
      // it means the OA was disconnected and reconnected - update to new connection
      if (
        conversation.platformConnectionId.toString() !== platformConnectionId
      ) {
        this.logger.log(
          `Updating conversation ${conversation._id} to new platform connection ${platformConnectionId}`
        );
        conversation.platformConnectionId = new Types.ObjectId(
          platformConnectionId
        );
        await conversation.save();
      }
    }

    if (!conversation) {
      // Fetch user info from Zalo API (simplified - you'll need to implement API call)
      const displayName = `Zalo User ${senderId.substring(0, Math.min(8, senderId.length))}`;
      const userInfo = {
        user_id: senderId, // Global user ID
        display_name: displayName,
        avatar: undefined,
      };

      conversation = await this.conversationModel.create({
        platform: "zalo",
        platformConversationId: conversationKey, // Use composite key
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        participants: [
          {
            platformUserId: senderId, // Global sender ID
            name: userInfo.display_name,
            avatar: userInfo.avatar,
            role: "customer",
          },
        ],
        status: "open",
        unreadCount: 0,
        metadata: {
          appId: payload.app_id,
        },
      });

      this.logger.log(
        `Created new conversation: ${conversation._id} for Zalo user ${senderId} and OA ${oaId}`
      );
    }

    // Determine message type from event_name
    const messageType = payload.event_name.replace('user_send_', ''); // user_send_text -> text

    // Create message
    this.logger.log("Creating message in database:", {
      conversationId: conversation._id,
      messageType,
      text: payload.message?.text,
      senderId: senderId,
    });

    const message = await this.messageModel.create({
      conversationId: conversation._id,
      platform: "zalo",
      platformMessageId: payload.message.msg_id,
      direction: "inbound",
      type: messageType,
      content: payload.message, // Store entire message object
      sender: {
        platformUserId: senderId,
        name:
          conversation.participants[0]?.name ||
          `Zalo User ${senderId.substring(0, Math.min(8, senderId.length))}`,
        avatar: conversation.participants[0]?.avatar,
      },
      status: "sent",
      metadata: {
        rawPayload: payload,
      },
    });

    this.logger.log(`✅ Message saved successfully: ${message._id}`);

    // Update conversation's last message
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: payload.message?.text || `[${messageType}]`,
        timestamp: new Date(parseInt(payload.timestamp)),
        senderId: senderId,
        messageId: message._id,
      },
      $inc: { unreadCount: 1 },
    });

    this.logger.log(
      `✅ Conversation updated: ${conversation._id} (unreadCount incremented)`
    );

    // TODO: Emit WebSocket event for real-time update
    // TODO: Publish to Kafka topic 'messages.incoming'
  }

  /**
   * Handle message delivery status
   */
  private async handleMessageDelivery(payload: ZaloWebhookDto): Promise<void> {
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
   * Handle message read status
   */
  private async handleMessageRead(payload: ZaloWebhookDto): Promise<void> {
    if (!payload.message) return;

    await this.messageModel.findOneAndUpdate(
      {
        platform: "zalo",
        platformMessageId: payload.message.msg_id,
      },
      { status: "read" }
    );

    // Reset unread count for conversation
    const message = await this.messageModel
      .findOne({
        platform: "zalo",
        platformMessageId: payload.message.msg_id,
      })
      .exec();

    if (message) {
      await this.conversationModel.findByIdAndUpdate(message.conversationId, {
        unreadCount: 0,
      });
    }

    this.logger.log(`Message ${payload.message.msg_id} read`);
  }
}
