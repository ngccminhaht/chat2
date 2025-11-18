import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac } from 'crypto';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { ShopeeWebhookDto, ShopeeMessageType } from './dto/shopee-webhook.dto';

@Injectable()
export class ShopeeWebhookService {
  private readonly logger = new Logger(ShopeeWebhookService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
  ) {}

  /**
   * Verify Shopee webhook signature
   * Shopee uses HMAC-SHA256 with partner_key
   */
  verifySignature(
    url: string,
    body: string,
    signature: string,
    partnerKey: string,
  ): boolean {
    // Shopee signature format: HMAC-SHA256(url + "|" + body, partner_key)
    const baseString = `${url}|${body}`;
    const hmac = createHmac('sha256', partnerKey);
    hmac.update(baseString);
    const calculatedSignature = hmac.digest('hex');

    return calculatedSignature === signature;
  }

  /**
   * Process incoming Shopee webhook event
   */
  async processWebhook(payload: ShopeeWebhookDto): Promise<void> {
    const shopId = payload.shop_id;

    this.logger.log(
      `Processing Shopee webhook for shop ${shopId}`,
    );

    // Find platform connection by shop ID
    const platformConnection = await this.platformConnectionModel
      .findOne({
        platform: 'shopee',
        platformAccountId: shopId.toString(),
      })
      .exec();

    if (!platformConnection) {
      this.logger.error(
        `❌ Platform connection NOT FOUND for Shopee shop ID: ${shopId}`,
      );
      throw new Error(
        `Platform connection not found for shop ${shopId}. Please connect your Shopee shop first.`,
      );
    }

    this.logger.log(`✅ Found platform connection: ${platformConnection._id}`);

    // Handle message event
    if (payload.data.message_id) {
      await this.handleIncomingMessage(payload, platformConnection._id.toString());
    }
  }

  /**
   * Handle incoming message from customer
   */
  private async handleIncomingMessage(
    payload: ShopeeWebhookDto,
    platformConnectionId: string,
  ): Promise<void> {
    const data = payload.data;
    const shopId = payload.shop_id.toString();
    const customerId = data.from_id?.toString();
    const conversationId = data.conversation_id;

    if (!customerId || !conversationId) {
      this.logger.error('Cannot process message: missing customer ID or conversation ID');
      return;
    }

    this.logger.log(`Processing message from customer ${customerId} in conversation ${conversationId}`);

    // Conversation key: conversation_id (Shopee provides unique conversation ID)
    const conversationKey = conversationId;

    // Find or create conversation
    let conversation = await this.conversationModel
      .findOne({
        platform: 'shopee',
        platformConversationId: conversationKey,
      })
      .exec();

    if (!conversation) {
      const displayName = data.from_name || `Shopee Customer ${customerId.substring(0, 8)}`;

      conversation = await this.conversationModel.create({
        platform: 'shopee',
        platformConversationId: conversationKey,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        platformAccountId: shopId,
        participants: [
          {
            platformUserId: customerId,
            name: displayName,
            role: 'customer',
          },
        ],
        status: 'open',
        unreadCount: 0,
        metadata: {
          shopId,
          region: data.region,
        },
      });

      this.logger.log(
        `Created new conversation: ${conversation._id} for customer ${customerId}`,
      );
    }

    // Determine message type
    const messageType = this.getMessageTypeString(data.message_type);

    // Create message
    const message = await this.messageModel.create({
      conversationId: conversation._id,
      platform: 'shopee',
      platformMessageId: data.message_id,
      direction: 'inbound',
      type: messageType,
      content: {
        text: data.content,
        type: data.message_type,
      },
      sender: {
        platformUserId: customerId,
        name: data.from_name || conversation.participants[0]?.name,
      },
      status: 'sent',
      metadata: {
        rawPayload: payload,
        region: data.region,
      },
    });

    this.logger.log(`✅ Message saved: ${message._id}`);

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

    // TODO: Emit WebSocket event
    // TODO: Publish to Kafka
  }

  /**
   * Convert Shopee message type number to string
   */
  private getMessageTypeString(messageType: number): string {
    switch (messageType) {
      case ShopeeMessageType.TEXT:
        return 'text';
      case ShopeeMessageType.IMAGE:
        return 'image';
      case ShopeeMessageType.ITEM:
        return 'item';
      case ShopeeMessageType.ORDER:
        return 'order';
      case ShopeeMessageType.STICKER:
        return 'sticker';
      case ShopeeMessageType.VIDEO:
        return 'video';
      case ShopeeMessageType.FILE:
        return 'file';
      default:
        return 'unknown';
    }
  }
}
