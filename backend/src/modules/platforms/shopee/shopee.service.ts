import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { createHmac, randomBytes } from "crypto";
import axios from "axios";
import { EnvService } from "@/common/env";
import {
  ConnectionStatus,
  ConversationStatus,
  MessageStatus,
} from "@/common/constants";
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
import { ShopeeWebhookDto, ShopeeMessageType } from "./dto/shopee-webhook.dto";
import {
  ShopeeTokenResponse,
  ShopeeShopInfo,
  ShopeeRefreshTokenResponse,
} from "./dto/oauth.dto";
import { WebsocketGateway } from "@/modules/websocket/websocket.gateway";
import { AIBatchingService } from "@/modules/ai-batching/ai-batching.service";

@Injectable()
export class ShopeeService {
  private readonly logger = new Logger(ShopeeService.name);

  // OAuth configuration
  private readonly partnerId: string;
  private readonly partnerKey: string;
  private readonly redirectUri: string;
  private readonly apiHost: string;

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    private websocketGateway: WebsocketGateway,
    private envService: EnvService,
    private aiBatchingService: AIBatchingService,
  ) {
    this.partnerId = this.envService.get("SHOPEE_PARTNER_ID");
    this.partnerKey = this.envService.get("SHOPEE_PARTNER_KEY");
    this.redirectUri = this.envService.get("SHOPEE_REDIRECT_URI");

    const region = this.envService.get("SHOPEE_REGION") || "vn";
    const isTestEnv = this.envService.get("SHOPEE_ENV") === "test";
    this.apiHost = isTestEnv
      ? `https://openplatform.sandbox.test-stable.shopee.sg`
      : `https://partner.shopeemobile.com`;
  }

  /**
   * Verify Shopee webhook signature
   * Shopee uses HMAC-SHA256 with partner_key
   */
  verifySignature(
    url: string,
    body: string,
    signature: string,
    partnerKey: string
  ): boolean {
    // Shopee signature format: HMAC-SHA256(url + "|" + body, partner_key)
    const baseString = `${url}|${body}`;

    console.log(baseString);

    const hmac = createHmac("sha256", partnerKey);
    hmac.update(baseString);
    const calculatedSignature = hmac.digest("hex");

    console.log({
      calculatedSignature,
      signature,
    });
    return calculatedSignature === signature;
  }

  /**
   * Process incoming Shopee webhook event
   */
  async processWebhook(payload: ShopeeWebhookDto): Promise<void> {
    const shopId = payload.shop_id;

    this.logger.log(`Processing Shopee webhook for shop ${shopId}`);

    // Find platform connection by shop ID
    const platformConnection = await this.platformConnectionModel
      .findOne({
        platform: "shopee",
        platformAccountId: shopId.toString(),
      })
      .exec();

    if (!platformConnection) {
      this.logger.error(
        `❌ Platform connection NOT FOUND for Shopee shop ID: ${shopId}`
      );
      throw new Error(
        `Platform connection not found for shop ${shopId}. Please connect your Shopee shop first.`
      );
    }

    this.logger.log(`✅ Found platform connection: ${platformConnection._id}`);

    // Handle message event
    if (payload.data.message_id) {
      await this.handleIncomingMessage(payload, platformConnection);
    }
  }

  /**
   * Handle incoming message from customer
   */
  private async handleIncomingMessage(
    payload: ShopeeWebhookDto,
    platformConnection: PlatformConnectionDocument
  ): Promise<void> {
    const platformConnectionId = platformConnection._id.toString();
    const data = payload.data;
    const shopId = payload.shop_id.toString();
    const customerId = data.from_id?.toString();
    const conversationId = data.conversation_id;

    if (!customerId || !conversationId) {
      this.logger.error(
        "Cannot process message: missing customer ID or conversation ID"
      );
      return;
    }

    this.logger.log(
      `Processing message from customer ${customerId} in conversation ${conversationId}`
    );

    // Conversation key: conversation_id (Shopee provides unique conversation ID)
    const conversationKey = conversationId;

    // Find or create conversation
    let conversation = await this.conversationModel
      .findOne({
        platform: "shopee",
        platformConversationId: conversationKey,
      })
      .exec();

    if (!conversation) {
      const displayName =
        data.from_name || `Shopee Customer ${customerId.substring(0, 8)}`;

      conversation = await this.conversationModel.create({
        platform: "shopee",
        platformConversationId: conversationKey,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        organizationId: platformConnection.organizationId,
        platformAccountId: shopId,
        customerPlatformUserId: customerId,
        customerName: displayName,
        status: ConversationStatus.OPEN,
        unreadCount: 0,
        metadata: {
          shopId,
          region: data.region,
        },
      });

      this.logger.log(
        `Created new conversation: ${conversation._id} for customer ${customerId}`
      );
    }

    // Determine message type
    const messageType = this.getMessageTypeString(data.message_type);
    const platformMessageId = data.message_id;

    // Check for duplicate
    const existingMessage = await this.messageModel
      .findOne({
        platform: "shopee",
        platformMessageId,
      })
      .exec();

    if (existingMessage) {
      this.logger.log(`⏭️ Skipping duplicate message: ${platformMessageId}`);
      return;
    }

    // Create message (with E11000 handling)
    let message: MessageDocument;
    try {
      message = await this.messageModel.create({
        conversationId: conversation._id,
        organizationId: conversation.organizationId,
        platform: "shopee",
        platformMessageId,
        direction: "inbound",
        type: messageType,
        content: {
          text: data.content,
          type: data.message_type,
        },
        sender: {
          platformUserId: customerId,
          name: data.from_name || conversation.customerName,
        },
        status: MessageStatus.SENT,
        metadata: {
          rawPayload: payload,
          region: data.region,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        this.logger.log(
          `⏭️ Skipping duplicate message (E11000): ${platformMessageId}`
        );
        return;
      }
      throw error;
    }

    this.logger.log(`✅ Message saved: ${message._id}`);

    // Trigger AI batching for auto-reply
    await this.aiBatchingService.onVisitorMessage(message, conversation);

    // Update conversation's last message
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: data.content || `[${messageType}]`,
        timestamp: new Date(data.created_timestamp * 1000),
        senderId: customerId,
        messageId: message._id,
      },
      $inc: { unreadCount: 1 },
    });

    this.logger.log(`✅ Conversation updated: ${conversation._id}`);

    // Publish WebSocket notification to frontend
    await this.publishWebSocketNotification(conversation, message);
  }

  /**
   * Emit WebSocket notification to frontend
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

      if (!platformConnection?.connectedBy) {
        this.logger.warn(
          `Cannot emit WebSocket notification: no connectedBy for conversation ${conversation._id}`
        );
        return;
      }

      const userId = platformConnection.connectedBy.toString();

      // Emit new message event
      this.websocketGateway.emitNewMessage(userId, {
        _id: message._id,
        conversationId: message.conversationId,
        type: message.type,
        content: message.content,
        sender: message.sender,
        status: message.status,
        createdAt: (message as any).createdAt,
      });

      // Emit conversation updated event
      this.websocketGateway.emitConversationUpdated(userId, {
        _id: conversation._id,
        unreadCount: conversation.unreadCount,
        lastMessage: conversation.lastMessage,
      });

      this.logger.log(
        `📤 Emitted WebSocket events for user ${userId} (conversation ${conversation._id})`
      );
    } catch (error) {
      this.logger.error("Failed to emit WebSocket notification:", error);
    }
  }

  /**
   * Convert Shopee message type number to string
   */
  private getMessageTypeString(messageType: number): string {
    switch (messageType) {
      case ShopeeMessageType.TEXT:
        return "text";
      case ShopeeMessageType.IMAGE:
        return "image";
      case ShopeeMessageType.ITEM:
        return "item";
      case ShopeeMessageType.ORDER:
        return "order";
      case ShopeeMessageType.STICKER:
        return "sticker";
      case ShopeeMessageType.VIDEO:
        return "video";
      case ShopeeMessageType.FILE:
        return "file";
      default:
        return "unknown";
    }
  }

  // ==================== OAuth Methods ====================

  private generateSignature(
    path: string,
    timestamp: number,
    body?: any,
    includePartnerId: boolean = true
  ): string {
    const partnerId = parseInt(this.partnerId);
    let baseString = includePartnerId
      ? `${partnerId}${path}${timestamp}`
      : `${path}${timestamp}`;

    if (body?.access_token) {
      baseString += body.access_token;
    }
    if (body?.shop_id) {
      baseString += body.shop_id;
    }

    const hmac = createHmac("sha256", this.partnerKey);
    hmac.update(baseString);
    return hmac.digest("hex");
  }

  getAuthorizationUrl(state?: string): { url: string; state: string } {
    const finalState = state || randomBytes(16).toString("hex");
    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSignature(path, timestamp);

    // Include state in redirect_uri so Shopee preserves it in callback
    const redirectWithState = `${this.redirectUri}?state=${finalState}`;

    const params = new URLSearchParams({
      partner_id: this.partnerId,
      redirect: redirectWithState,
      sign,
      timestamp: timestamp.toString(),
    });

    return {
      url: `${this.apiHost}${path}?${params.toString()}`,
      state: finalState,
    };
  }

  async exchangeCodeForToken(
    code: string,
    shopId: string
  ): Promise<ShopeeTokenResponse> {
    try {
      const path = "/api/v2/auth/token/get";
      const timestamp = Math.floor(Date.now() / 1000);
      const partnerId = parseInt(this.partnerId);
      const shopIdInt = parseInt(shopId);

      const baseString = `${partnerId}${path}${timestamp}`;
      const hmac = createHmac("sha256", this.partnerKey);
      hmac.update(baseString);
      const sign = hmac.digest("hex");

      const response = await axios.post(
        `${this.apiHost}${path}`,
        { code, shop_id: shopIdInt, partner_id: partnerId },
        { params: { partner_id: partnerId, timestamp, sign } }
      );

      if (response.data.error && response.data.error !== "") {
        throw new BadRequestException(
          `Shopee OAuth error: ${response.data.message || response.data.error}`
        );
      }

      const tokenData = response.data.response || response.data;

      if (!tokenData?.access_token) {
        throw new BadRequestException(
          "Shopee OAuth response missing access_token"
        );
      }

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expire_in: tokenData.expire_in,
        shop_id: tokenData.shop_id || shopIdInt,
      };
    } catch (error) {
      this.logger.error(
        "Failed to exchange code for token:",
        error.response?.data || error.message
      );
      throw new BadRequestException("Failed to exchange authorization code");
    }
  }

  async getShopInfo(
    accessToken: string,
    shopId: number
  ): Promise<ShopeeShopInfo> {
    try {
      const path = "/api/v2/shop/get_shop_info";
      const timestamp = Math.floor(Date.now() / 1000);
      const partnerId = parseInt(this.partnerId);

      const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
      const hmac = createHmac("sha256", this.partnerKey);
      hmac.update(baseString);
      const sign = hmac.digest("hex");

      const queryString = `partner_id=${partnerId}&shop_id=${shopId}&timestamp=${timestamp}&access_token=${encodeURIComponent(
        accessToken
      )}&sign=${sign}`;
      const response = await axios.get(`${this.apiHost}${path}?${queryString}`);

      if (response.data.error && response.data.error !== "") {
        throw new BadRequestException(
          `Failed to get shop info: ${response.data.message}`
        );
      }

      const shopData = response.data;
      return {
        shop_id: shopId,
        shop_name: shopData.shop_name,
        region: shopData.region,
        status: shopData.status,
        logo: shopData.shop_logo,
      };
    } catch (error) {
      this.logger.error(
        "Failed to get shop info:",
        error.response?.data || error.message
      );
      throw new BadRequestException("Failed to fetch Shopee shop information");
    }
  }

  async savePlatformConnection(
    userId: string,
    organizationId: string,
    tokenResponse: ShopeeTokenResponse,
    shopInfo: ShopeeShopInfo
  ): Promise<any> {
    if (!tokenResponse.access_token) {
      throw new BadRequestException(
        "Invalid token response: missing access_token"
      );
    }

    const expiresAt = new Date(Date.now() + tokenResponse.expire_in * 1000);

    // Find by organizationId (multi-tenant) instead of userId
    let existing = await this.platformConnectionModel
      .findOne({
        organizationId: new Types.ObjectId(organizationId),
        platform: "shopee",
        platformAccountId: shopInfo.shop_id.toString(),
      })
      .exec();

    if (existing) {
      existing.platformAccountName = shopInfo.shop_name;
      existing.credentials = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      };
      existing.status = ConnectionStatus.ACTIVE;
      existing.connectedBy = new Types.ObjectId(userId);
      existing.metadata = {
        ...existing.metadata,
        shopId: shopInfo.shop_id.toString(),
        region: shopInfo.region,
        logo: shopInfo.logo,
      };
      existing.lastSyncAt = new Date();

      return existing.save();
    }

    return this.platformConnectionModel.create({
      organizationId: new Types.ObjectId(organizationId),
      connectedBy: new Types.ObjectId(userId),
      platform: "shopee",
      platformAccountId: shopInfo.shop_id.toString(),
      platformAccountName: shopInfo.shop_name,
      credentials: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      },
      status: ConnectionStatus.ACTIVE,
      metadata: {
        shopId: shopInfo.shop_id.toString(),
        region: shopInfo.region,
        logo: shopInfo.logo,
      },
      lastSyncAt: new Date(),
    });
  }

  async refreshToken(
    refreshToken: string,
    shopId: number
  ): Promise<ShopeeRefreshTokenResponse> {
    try {
      const path = "/api/v2/auth/access_token/get";
      const timestamp = Math.floor(Date.now() / 1000);
      const partnerId = parseInt(this.partnerId);

      const baseString = `${partnerId}${path}${timestamp}${shopId}`;
      const hmac = createHmac("sha256", this.partnerKey);
      hmac.update(baseString);
      const sign = hmac.digest("hex");

      const response = await axios.post(
        `${this.apiHost}${path}`,
        { refresh_token: refreshToken, shop_id: shopId, partner_id: partnerId },
        { params: { partner_id: partnerId, timestamp, sign } }
      );

      if (response.data.error) {
        throw new BadRequestException(
          `Shopee token refresh error: ${
            response.data.message || response.data.error
          }`
        );
      }

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expire_in: response.data.expire_in,
        shop_id: response.data.shop_id,
      };
    } catch (error) {
      this.logger.error(
        "Failed to refresh token:",
        error.response?.data || error.message
      );
      throw new BadRequestException("Failed to refresh Shopee access token");
    }
  }

  async syncConversations(platformConnectionId: string): Promise<number> {
    try {
      this.logger.log(
        `Conversation sync for Shopee connection ${platformConnectionId}`
      );
      this.logger.log("Note: Shopee conversations are synced via webhooks");
      return 0;
    } catch (error) {
      this.logger.error("Failed to sync conversations:", error);
      throw error;
    }
  }
}
