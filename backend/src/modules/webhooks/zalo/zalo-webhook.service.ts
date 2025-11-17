import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
import { ZaloWebhookDto, ZaloUserInfo } from './dto/zalo-webhook.dto';

@Injectable()
export class ZaloWebhookService {
  private readonly logger = new Logger(ZaloWebhookService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
  ) {}

  /**
   * Verify Zalo webhook signature
   */
  verifySignature(data: string, signature: string, appSecret: string): boolean {
    const hmac = createHmac('sha256', appSecret);
    hmac.update(data);
    const calculatedSignature = hmac.digest('hex');
    return calculatedSignature === signature;
  }

  /**
   * Process incoming Zalo webhook event
   * If platformConnectionId is not provided, it will be auto-found from payload.app_id
   */
  async processWebhook(
    payload: ZaloWebhookDto,
    platformConnectionId?: string,
  ): Promise<void> {
    this.logger.log(
      `Processing Zalo webhook event: ${payload.event_name} from user ${payload.user_id_by_app}`,
    );

    // Auto-find platformConnectionId from OA ID if not provided
    if (!platformConnectionId) {
      let connection = await this.platformConnectionModel
        .findOne({
          platform: 'zalo',
          platformAccountId: payload.app_id,
        })
        .exec();

      if (!connection) {
        this.logger.warn(
          `Platform connection not found for Zalo OA ID: ${payload.app_id}, creating placeholder connection`,
        );

        // Create a placeholder connection to allow webhook processing
        // User will need to properly authenticate later to send messages
        connection = await this.platformConnectionModel.create({
          platform: 'zalo',
          platformAccountId: payload.app_id,
          platformAccountName: `Zalo OA ${payload.app_id.substring(0, 8)}`,
          credentials: {
            accessToken: 'placeholder', // Will be updated when user authenticates
            refreshToken: 'placeholder',
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          },
          status: 'pending', // Mark as pending until proper authentication
          metadata: {
            createdFromWebhook: true,
            oaId: payload.app_id,
          },
          lastSyncAt: new Date(),
        });

        this.logger.log(
          `Created placeholder connection: ${connection._id} for OA ID: ${payload.app_id}`,
        );
      }

      platformConnectionId = connection._id.toString();
      this.logger.log(
        `Found platform connection: ${platformConnectionId} for OA ID: ${payload.app_id}`,
      );
    }

    switch (payload.event_name) {
      case 'user_send_text':
      case 'user_send_image':
      case 'user_send_video':
      case 'user_send_file':
      case 'user_send_audio':
      case 'user_send_sticker':
      case 'user_send_location':
        await this.handleIncomingMessage(payload, platformConnectionId);
        break;

      case 'user_received_message':
        await this.handleMessageDelivery(payload);
        break;

      case 'user_seen_message':
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
    platformConnectionId: string,
  ): Promise<void> {
    if (!payload.message || !payload.sender) {
      this.logger.error('Invalid message payload - missing required fields:', {
        hasMessage: !!payload.message,
        hasSender: !!payload.sender,
        payload: JSON.stringify(payload, null, 2),
      });
      return;
    }

    // Find or create conversation
    let conversation = await this.conversationModel
      .findOne({
        platform: 'zalo',
        platformConversationId: payload.user_id_by_app,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
      })
      .exec();

    if (!conversation) {
      // Fetch user info from Zalo API (simplified - you'll need to implement API call)
      const userInfo: ZaloUserInfo = {
        user_id: payload.sender.id,
        user_id_by_app: payload.user_id_by_app,
        display_name: `Zalo User ${payload.user_id_by_app.substring(0, 8)}`,
        avatar: undefined,
      };

      conversation = await this.conversationModel.create({
        platform: 'zalo',
        platformConversationId: payload.user_id_by_app,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        participants: [
          {
            platformUserId: userInfo.user_id_by_app,
            name: userInfo.display_name,
            avatar: userInfo.avatar,
            role: 'customer',
          },
        ],
        status: 'open',
        unreadCount: 0,
        metadata: {
          appId: payload.app_id,
        },
      });

      this.logger.log(
        `Created new conversation: ${conversation._id} for Zalo user ${payload.user_id_by_app}`,
      );
    }

    // Normalize message content
    let messageType: string;
    let content: any;

    try {
      const normalized = this.normalizeMessageContent(payload);
      messageType = normalized.messageType;
      content = normalized.content;
    } catch (error) {
      this.logger.error('Failed to normalize message content:', {
        error: error.message,
        payload: JSON.stringify(payload, null, 2),
      });
      throw error;
    }

    // Create message
    this.logger.log('Creating message in database:', {
      conversationId: conversation._id,
      messageType,
      contentPreview: messageType === 'text' ? content.text?.substring(0, 50) : `[${messageType}]`,
      senderId: payload.user_id_by_app,
    });

    const message = await this.messageModel.create({
      conversationId: conversation._id,
      platform: 'zalo',
      platformMessageId: payload.message.msg_id,
      direction: 'inbound',
      type: messageType,
      content,
      sender: {
        platformUserId: payload.user_id_by_app,
        name:
          conversation.participants[0]?.name ||
          `Zalo User ${payload.user_id_by_app.substring(0, 8)}`,
        avatar: conversation.participants[0]?.avatar,
      },
      status: 'sent',
      metadata: {
        rawPayload: payload,
      },
    });

    this.logger.log(`✅ Message saved successfully: ${message._id}`);

    // Update conversation's last message
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: content.text || `[${messageType}]`,
        timestamp: new Date(parseInt(payload.timestamp)),
        senderId: payload.user_id_by_app,
        messageId: message._id,
      },
      $inc: { unreadCount: 1 },
    });

    this.logger.log(`✅ Conversation updated: ${conversation._id} (unreadCount incremented)`);

    // TODO: Emit WebSocket event for real-time update
    // TODO: Publish to Kafka topic 'messages.incoming'
  }

  /**
   * Normalize Zalo message to internal format
   */
  private normalizeMessageContent(payload: ZaloWebhookDto): {
    messageType: string;
    content: any;
  } {
    const message = payload.message!;

    // Text message
    if (message.text) {
      return {
        messageType: 'text',
        content: {
          text: message.text,
        },
      };
    }

    // Attachment messages
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];

      switch (attachment.type) {
        case 'image':
          return {
            messageType: 'image',
            content: {
              mediaUrl: attachment.payload.url,
              thumbnailUrl: attachment.payload.thumbnail,
            },
          };

        case 'video':
          return {
            messageType: 'video',
            content: {
              mediaUrl: attachment.payload.url,
              thumbnailUrl: attachment.payload.thumbnail,
            },
          };

        case 'file':
          return {
            messageType: 'file',
            content: {
              mediaUrl: attachment.payload.url,
              fileName: attachment.payload.name,
              fileSize: attachment.payload.size,
            },
          };

        case 'audio':
          return {
            messageType: 'audio',
            content: {
              mediaUrl: attachment.payload.url,
            },
          };

        case 'sticker':
          return {
            messageType: 'sticker',
            content: {
              stickerId: attachment.payload.id,
            },
          };

        case 'location':
          return {
            messageType: 'location',
            content: {
              latitude: attachment.payload.coordinates?.latitude,
              longitude: attachment.payload.coordinates?.longitude,
            },
          };

        default:
          throw new BadRequestException(
            `Unsupported attachment type: ${attachment.type}`,
          );
      }
    }

    throw new BadRequestException('Invalid message - no text or attachments');
  }

  /**
   * Handle message delivery status
   */
  private async handleMessageDelivery(payload: ZaloWebhookDto): Promise<void> {
    if (!payload.message) return;

    await this.messageModel.findOneAndUpdate(
      {
        platform: 'zalo',
        platformMessageId: payload.message.msg_id,
      },
      { status: 'delivered' },
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
        platform: 'zalo',
        platformMessageId: payload.message.msg_id,
      },
      { status: 'read' },
    );

    // Reset unread count for conversation
    const message = await this.messageModel
      .findOne({
        platform: 'zalo',
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
