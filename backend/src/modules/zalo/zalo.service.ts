import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { createHmac, createHash, randomBytes } from "crypto";
import axios from "axios";
import { EnvService } from "@/common/env";
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
import { ZaloWebhookDto } from "./dto/zalo-webhook.dto";
import { ZaloTokenResponse, ZaloOAInfo } from "./dto/oauth.dto";
import { KafkaProducerService } from "@/infra/kafka/kafka-producer.service";
import { KAFKA_TOPICS } from "@/infra/kafka/kafka.config";
import {
  WebSocketNotificationEvent,
  NewMessagePayload,
  ConversationUpdatedPayload,
} from "@/infra/kafka/types/webhook.types";

@Injectable()
export class ZaloService {
  private readonly logger = new Logger(ZaloService.name);

  // OAuth configuration
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    private kafkaProducer: KafkaProducerService,
    private envService: EnvService
  ) {
    this.appId = this.envService.get("ZALO_APP_ID");
    this.appSecret = this.envService.get("ZALO_APP_SECRET");
    this.redirectUri = this.envService.get("ZALO_REDIRECT_URI");
  }

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
    const senderId = payload.sender?.id || "unknown";
    this.logger.log(
      `Processing Zalo webhook event: ${payload.event_name} from sender ${senderId}`
    );

    // Auto-find platformConnectionId from OA ID if not provided
    if (!platformConnectionId) {
      const oaId = payload.recipient?.id;

      if (!oaId) {
        this.logger.error(
          "❌ Cannot find platform connection: missing recipient.id (OA ID)"
        );
        throw new Error("Missing OA ID in webhook payload");
      }

      this.logger.log(
        `=== Webhook: Looking for platform connection for OA ID: ${oaId} ===`
      );

      let connection = await this.platformConnectionModel
        .findOne({
          platform: "zalo",
          platformAccountId: oaId,
        })
        .exec();

      if (!connection) {
        this.logger.error(
          `❌ Platform connection NOT FOUND for Zalo OA ID: ${oaId}`
        );
        this.logger.error(
          `User must connect this OA via OAuth before receiving messages!`
        );
        throw new Error(
          `Platform connection not found for OA ${oaId}. Please connect your Zalo OA first.`
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
    // Get OA ID (which OA received this message) - recipient.id is the OA ID
    const oaId = payload.recipient?.id;

    if (!senderId || typeof senderId !== "string") {
      this.logger.error(
        "Cannot process message: missing or invalid sender.id:",
        {
          hasSender: !!payload.sender,
          senderId: payload.sender?.id,
          senderIdType: typeof payload.sender?.id,
          payload: JSON.stringify(payload, null, 2),
        }
      );
      return;
    }

    if (!oaId || typeof oaId !== "string") {
      this.logger.error(
        "Cannot process message: missing or invalid recipient.id (OA ID):",
        {
          hasRecipient: !!payload.recipient,
          oaId: payload.recipient?.id,
          oaIdType: typeof payload.recipient?.id,
          payload: JSON.stringify(payload, null, 2),
        }
      );
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
      const displayName = `Zalo User ${senderId.substring(
        0,
        Math.min(8, senderId.length)
      )}`;
      const userInfo = {
        user_id: senderId, // Global user ID
        display_name: displayName,
        avatar: undefined,
      };

      conversation = await this.conversationModel.create({
        platform: "zalo",
        platformConversationId: conversationKey, // Use composite key
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        platformAccountId: oaId, // Store OA ID for easy querying
        customerPlatformUserId: senderId, // Global sender ID
        customerName: userInfo.display_name,
        customerAvatar: userInfo.avatar,
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
    const messageType = payload.event_name.replace("user_send_", ""); // user_send_text -> text

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
        name: conversation.customerName,
        avatar: conversation.customerAvatar,
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

    // Publish WebSocket notification to frontend
    await this.publishWebSocketNotification(conversation, message);
  }

  /**
   * Publish WebSocket notification to Kafka
   * Kafka consumer will emit to Socket.IO clients
   */
  private async publishWebSocketNotification(
    conversation: ConversationDocument,
    message: MessageDocument
  ): Promise<void> {
    try {
      // Get userId from platform connection
      const platformConnection = await this.platformConnectionModel
        .findById(conversation.platformConnectionId)
        .exec();

      if (!platformConnection?.userId) {
        this.logger.warn(
          `Cannot publish notification: no userId for conversation ${conversation._id}`
        );
        return;
      }

      const userId = platformConnection.userId.toString();

      // Publish new message event to Kafka
      const newMessageEvent: WebSocketNotificationEvent = {
        type: "message:new",
        userId,
        payload: {
          _id: message._id.toString(),
          conversationId: message.conversationId.toString(),
          platform: message.platform,
          direction: message.direction,
          type: message.type,
          content: message.content,
          sender: message.sender,
          status: message.status,
          createdAt: (message as any).createdAt,
        } as NewMessagePayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: userId, // Partition by userId
        value: newMessageEvent,
      });

      // Publish conversation updated event to Kafka
      const conversationEvent: WebSocketNotificationEvent = {
        type: "conversation:updated",
        userId,
        payload: {
          _id: conversation._id.toString(),
          platform: conversation.platform,
          unreadCount: conversation.unreadCount,
          lastMessage: conversation.lastMessage,
        } as ConversationUpdatedPayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: userId, // Partition by userId
        value: conversationEvent,
      });

      this.logger.log(
        `📤 Published Kafka events for user ${userId} (conversation ${conversation._id})`
      );
    } catch (error) {
      this.logger.error("Failed to publish Kafka notification:", error);
    }
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

  // ==================== OAuth Methods ====================

  generateCodeVerifier(): string {
    return randomBytes(32).toString("base64url");
  }

  generateCodeChallenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
  }

  getAuthorizationUrl(state?: string): {
    url: string;
    codeVerifier: string;
    state: string;
  } {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const finalState = state || randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: this.redirectUri,
      code_challenge: codeChallenge,
      state: finalState,
    });

    return {
      url: `https://oauth.zaloapp.com/v4/oa/permission?${params.toString()}`,
      codeVerifier,
      state: finalState,
    };
  }

  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    oaId?: string
  ): Promise<ZaloTokenResponse> {
    try {
      const params: Record<string, string> = {
        app_id: this.appId,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri, // IMPORTANT: Must match authorization request
      };

      if (oaId) {
        params.oa_id = oaId;
      }

      this.logger.log("🔄 Exchanging code for token with params:", {
        app_id: this.appId,
        code: code.substring(0, 20) + "...",
        code_verifier: codeVerifier.substring(0, 20) + "...",
        oa_id: oaId,
        redirect_uri: this.redirectUri,
      });

      const formData = new URLSearchParams(params);

      const response = await axios.post(
        "https://oauth.zaloapp.com/v4/oa/access_token",
        formData.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            secret_key: this.appSecret,
          },
        }
      );

      this.logger.log("📥 Zalo token response:", {
        error: response.data.error,
        error_name: response.data.error_name,
        message: response.data.message,
        hasData: !!response.data.data,
      });

      // Zalo returns { error: -xxx, ... } on failure, { data: { ... } } on success
      // Check if error exists and is non-zero (undefined/0 = success)
      if (response.data.error) {
        this.logger.error("❌ Zalo OAuth error:", response.data);
        const errorMessage =
          response.data.error_name ||
          response.data.message ||
          response.data.error_description ||
          `error code ${response.data.error}`;
        throw new BadRequestException(`Zalo OAuth error: ${errorMessage}`);
      }

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      // Re-throw BadRequestException as-is (don't wrap)
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error("❌ Failed to exchange code for token:", {
        error: error.response?.data || error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        fullResponse: JSON.stringify(error.response?.data, null, 2),
      });

      // Return more detailed error message
      const errorDetail =
        error.response?.data?.message ||
        error.response?.data?.error_name ||
        error.response?.data?.error_description ||
        error.message;
      throw new BadRequestException(
        `Failed to exchange authorization code: ${errorDetail}`
      );
    }
  }

  async getOAInfo(accessToken: string): Promise<ZaloOAInfo> {
    try {
      const response = await axios.get(
        "https://openapi.zalo.me/v2.0/oa/getoa",
        {
          headers: {
            access_token: accessToken,
          },
        }
      );

      if (response.data.error !== 0) {
        throw new BadRequestException(
          `Failed to get OA info: ${response.data.message}`
        );
      }

      return response.data.data;
    } catch (error) {
      this.logger.error(
        "Failed to get OA info:",
        error.response?.data || error.message
      );
      throw new BadRequestException("Failed to fetch Zalo OA information");
    }
  }

  async savePlatformConnection(
    userId: string,
    tokenResponse: ZaloTokenResponse,
    oaInfo: ZaloOAInfo
  ): Promise<any> {
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    let existing = await this.platformConnectionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        platform: "zalo",
        platformAccountId: oaInfo.oa_id,
      })
      .exec();

    if (existing) {
      existing.platformAccountName = oaInfo.name;
      existing.credentials = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      };
      existing.status = "active";
      existing.metadata = {
        ...existing.metadata,
        oaId: oaInfo.oa_id,
        description: oaInfo.description,
        avatar: oaInfo.avatar,
      };
      existing.lastSyncAt = new Date();

      return existing.save();
    }

    return this.platformConnectionModel.create({
      userId: new Types.ObjectId(userId),
      platform: "zalo",
      platformAccountId: oaInfo.oa_id,
      platformAccountName: oaInfo.name,
      credentials: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      },
      status: "active",
      metadata: {
        oaId: oaInfo.oa_id,
        description: oaInfo.description,
        avatar: oaInfo.avatar,
      },
      lastSyncAt: new Date(),
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<ZaloTokenResponse> {
    try {
      const params = new URLSearchParams({
        app_id: this.appId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });

      const response = await axios.post(
        "https://oauth.zaloapp.com/v4/oa/access_token",
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            secret_key: this.appSecret,
          },
        }
      );

      if (response.data.error !== 0) {
        throw new BadRequestException(
          `Zalo token refresh error: ${
            response.data.error_name || response.data.message
          }`
        );
      }

      return {
        access_token: response.data.data.access_token,
        refresh_token: response.data.data.refresh_token,
        expires_in: response.data.data.expires_in,
      };
    } catch (error) {
      this.logger.error(
        "Failed to refresh token:",
        error.response?.data || error.message
      );
      throw new BadRequestException("Failed to refresh Zalo access token");
    }
  }

  async syncConversations(platformConnectionId: string): Promise<number> {
    try {
      this.logger.log(
        `Conversation sync for Zalo connection ${platformConnectionId}`
      );
      this.logger.log("Note: Zalo conversations are synced via webhooks");
      return 0;
    } catch (error) {
      this.logger.error("Failed to sync conversations:", error);
      throw error;
    }
  }
}
