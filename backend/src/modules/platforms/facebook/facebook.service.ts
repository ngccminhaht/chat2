import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { createHmac, randomBytes } from "crypto";
import axios from 'axios';
import { EnvService } from '@/common/env';
import { ConnectionStatus, ConversationStatus, MessageStatus } from '@/common/constants';
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
  FacebookWebhookDto,
  FacebookMessagingEvent,
  FacebookChange,
  FacebookChangeValue,
} from "./dto/facebook-webhook.dto";
import {
  FacebookTokenResponse,
  FacebookPageInfo,
  FacebookUserInfo,
} from './dto/oauth.dto';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import {
  WebSocketNotificationEvent,
  NewMessagePayload,
  ConversationUpdatedPayload,
} from '@/infra/kafka/types/webhook.types';

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);

  // OAuth configuration
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly graphApiVersion: string = 'v19.0';

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    private kafkaProducer: KafkaProducerService,
    private envService: EnvService,
  ) {
    this.appId = this.envService.get('FACEBOOK_APP_ID');
    this.appSecret = this.envService.get('FACEBOOK_APP_SECRET');
    this.redirectUri = this.envService.get('FACEBOOK_REDIRECT_URI');
  }

  /**
   * Verify Facebook webhook signature
   * Facebook uses: x-hub-signature-256: sha256=<hash>
   * Hash is HMAC-SHA256 of raw request body using app secret
   */
  verifySignature(rawBody: string, signature: string, appSecret: string): boolean {
    if (!signature) {
      return false;
    }

    // Signature format: sha256=<hash>
    const parts = signature.split("=");
    if (parts.length !== 2 || parts[0] !== "sha256") {
      return false;
    }

    const hmac = createHmac("sha256", appSecret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest("hex");

    return calculatedSignature === parts[1];
  }

  /**
   * Process incoming Facebook webhook event
   * Automatically finds platform connection from Page ID (entry.id)
   */
  async processWebhook(payload: FacebookWebhookDto): Promise<void> {
    if (payload.object !== "page") {
      this.logger.warn(`Skipping webhook for object: ${payload.object}`);
      return;
    }

    for (const entry of payload.entry) {
      const pageId = entry.id;
      this.logger.log(`Processing Facebook webhook for Page ID: ${pageId}`);

      // Auto-find platform connection from Page ID
      const connection = await this.platformConnectionModel
        .findOne({
          platform: "facebook",
          platformAccountId: pageId,
        })
        .exec();

      if (!connection) {
        this.logger.error(
          `❌ Platform connection NOT FOUND for Facebook Page ID: ${pageId}`
        );
        this.logger.error(
          `User must connect this Facebook Page via OAuth before receiving messages!`
        );
        continue; // Skip this entry but process others
      }

      this.logger.log(`✅ Found platform connection: ${connection._id}`);

      const platformConnectionId = connection._id.toString();

      // Process messaging events
      if (entry.messaging) {
        for (const event of entry.messaging) {
          await this.processMessagingEvent(
            event,
            pageId,
            platformConnectionId,
            connection
          );
        }
      }

      // Process feed/comments events
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'comments' || change.field === 'feed') {
            await this.handleComments(
              change,
              pageId,
              platformConnectionId,
              new Date(entry.time),
              connection
            );
          }
        }
      }
    }
  }

  /**
   * Process a single messaging event
   */
  private async processMessagingEvent(
    event: FacebookMessagingEvent,
    pageId: string,
    platformConnectionId: string,
    connection: PlatformConnectionDocument
  ): Promise<void> {
    const senderId = event.sender.id;
    const timestamp = new Date(event.timestamp);

    this.logger.log(
      `Processing event from sender ${senderId} to page ${pageId}`
    );

    try {
      if (event.message) {
        await this.handleIncomingMessage(
          event,
          pageId,
          platformConnectionId,
          timestamp,
          connection
        );
      } else if (event.delivery) {
        await this.handleDelivery(event, timestamp);
      } else if (event.read) {
        await this.handleRead(event, timestamp);
      } else if (event.postback) {
        await this.handlePostback(event, pageId, platformConnectionId, timestamp, connection);
      } else {
        this.logger.debug(`Unknown event type for sender ${senderId}`);
      }
    } catch (error) {
      this.logger.error(`Error processing event from ${senderId}:`, error);
    }
  }

  /**
   * Handle incoming message from user
   */
  private async handleIncomingMessage(
    event: FacebookMessagingEvent,
    pageId: string,
    platformConnectionId: string,
    timestamp: Date,
    connection: PlatformConnectionDocument
  ): Promise<void> {
    const senderId = event.sender.id;
    const message = event.message;

    if (!message) return;

    // Ignore echo messages (sent by the page itself)
    if (message.is_echo || senderId === pageId) {
      this.logger.debug(`Ignoring echo message from page ${pageId}`);
      return;
    }

    // Conversation key: senderId_pageId (one user can message multiple pages)
    const conversationKey = `${senderId}_${pageId}`;

    this.logger.log(`Looking for conversation with key: ${conversationKey}`);

    let conversation = await this.conversationModel
      .findOne({
        platform: "facebook",
        platformConversationId: conversationKey,
      })
      .exec();

    if (conversation) {
      // Update to new connection if it was reconnected
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

    // Fetch user profile info
    const pageAccessToken = connection.credentials.accessToken;
    const userProfile = await this.getSenderProfile(
      pageAccessToken,
      senderId
    );

    if (!conversation) {
      // Create new conversation with real user info
      conversation = await this.conversationModel.create({
        platform: "facebook",
        platformConversationId: conversationKey,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        organizationId: connection.organizationId,
        platformAccountId: pageId, // Store Page ID for easy querying
        customerPlatformUserId: senderId,
        customerName: userProfile.name,
        customerAvatar: userProfile.profile_pic,
        status: ConversationStatus.OPEN,
        unreadCount: 0,
        metadata: {
          pageId: pageId,
        },
      });

      this.logger.log(
        `✅ Created new conversation: ${conversation._id} for Facebook user ${userProfile.name} (${senderId})`
      );
    } else {
      // Update existing conversation customer info if it's a placeholder
      if (conversation.customerName.startsWith('Facebook User ')) {
        conversation.customerName = userProfile.name;
        conversation.customerAvatar = userProfile.profile_pic;
        await conversation.save();
        this.logger.log(`✅ Updated customer info for conversation ${conversation._id}`);
      }
    }

    // Determine message type
    let messageType = "text";
    let messageText = message.text || "";

    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];
      messageType = attachment.type;

      if (attachment.type === "image") {
        messageText = `[Image: ${attachment.payload?.url || ""}]`;
      } else if (attachment.type === "video") {
        messageText = `[Video: ${attachment.payload?.url || ""}]`;
      } else if (attachment.type === "file") {
        messageText = `[File: ${attachment.payload?.title || attachment.payload?.url || ""}]`;
      } else if (attachment.type === "location") {
        const lat = attachment.payload?.coordinates?.lat;
        const long = attachment.payload?.coordinates?.long;
        messageText = `[Location: ${lat}, ${long}]`;
      } else if (attachment.type === "audio") {
        messageText = `[Audio: ${attachment.payload?.url || ""}]`;
      }
    }

    // Create message (with duplicate check)
    const messageId = message.mid;

    this.logger.log("Creating message in database:", {
      conversationId: conversation._id,
      messageType,
      text: messageText,
      senderId: senderId,
    });

    // Check for duplicate before creating
    const existingMessage = await this.messageModel.findOne({
      platform: "facebook",
      platformMessageId: messageId,
    }).exec();

    if (existingMessage) {
      this.logger.log(`⏭️ Skipping duplicate message: ${messageId}`);
      return;
    }

    let newMessage: MessageDocument;
    try {
      newMessage = await this.messageModel.create({
        conversationId: conversation._id,
        organizationId: conversation.organizationId,
        platform: "facebook",
        platformMessageId: messageId,
        direction: "inbound",
        type: messageType,
        content: {
          text: messageText,
          mediaUrl: message.attachments?.[0]?.payload?.url,
          mediaType: message.attachments?.[0]?.type,
        },
        sender: {
          platformUserId: senderId,
          name: userProfile.name,
          avatar: userProfile.profile_pic,
        },
        status: MessageStatus.SENT,
        metadata: {
          rawPayload: event,
        },
      });
    } catch (error) {
      // E11000 duplicate key error - race condition, skip
      if (error.code === 11000) {
        this.logger.log(`⏭️ Skipping duplicate message (E11000): ${messageId}`);
        return;
      }
      throw error;
    }

    this.logger.log(`✅ Message saved successfully: ${newMessage._id}`);

    // Update conversation's last message
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: messageText,
        timestamp: timestamp,
        senderId: senderId,
        messageId: newMessage._id,
      },
      $inc: { unreadCount: 1 },
    });

    this.logger.log(
      `✅ Conversation updated: ${conversation._id} (unreadCount incremented)`
    );

    // Reload conversation to get updated unreadCount
    const updatedConversation = await this.conversationModel.findById(conversation._id).exec();

    // Publish WebSocket notification
    await this.publishWebSocketNotification(updatedConversation, newMessage);
  }

  /**
   * Handle message delivery status
   */
  private async handleDelivery(
    event: FacebookMessagingEvent,
    timestamp: Date
  ): Promise<void> {
    const delivery = event.delivery;
    if (!delivery?.mids) return;

    for (const mid of delivery.mids) {
      await this.messageModel.findOneAndUpdate(
        {
          platform: "facebook",
          platformMessageId: mid,
        },
        { status: MessageStatus.DELIVERED }
      );
    }

    this.logger.log(`✅ Marked ${delivery.mids.length} messages as delivered`);
  }

  /**
   * Handle message read status
   */
  private async handleRead(
    event: FacebookMessagingEvent,
    timestamp: Date
  ): Promise<void> {
    // Facebook read events only include watermark, not specific message IDs
    // Update all messages before watermark timestamp to "read"
    if (!event.read?.watermark) return;

    // Find the message at the watermark and mark it as read
    const message = await this.messageModel
      .findOne({
        platform: "facebook",
        createdAt: { $lte: new Date(event.read.watermark) },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (message) {
      // Mark message and conversation
      await this.messageModel.updateMany(
        {
          conversationId: message.conversationId,
          platform: "facebook",
          createdAt: { $lte: new Date(event.read.watermark) },
        },
        { status: MessageStatus.READ }
      );

      // Reset conversation unread count
      await this.conversationModel.findByIdAndUpdate(message.conversationId, {
        unreadCount: 0,
      });

      this.logger.log(
        `✅ Marked messages as read for conversation ${message.conversationId}`
      );
    }
  }

  /**
   * Handle postback (button clicks, etc.)
   */
  private async handlePostback(
    event: FacebookMessagingEvent,
    pageId: string,
    platformConnectionId: string,
    timestamp: Date,
    connection: PlatformConnectionDocument
  ): Promise<void> {
    const senderId = event.sender.id;
    const postback = event.postback;

    if (!postback) return;

    const conversationKey = `${senderId}_${pageId}`;

    let conversation = await this.conversationModel
      .findOne({
        platform: "facebook",
        platformConversationId: conversationKey,
      })
      .exec();

    if (!conversation) {
      conversation = await this.conversationModel.create({
        platform: "facebook",
        platformConversationId: conversationKey,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        organizationId: connection.organizationId,
        platformAccountId: pageId,
        customerPlatformUserId: senderId,
        customerName: `Facebook User ${senderId}`,
        status: ConversationStatus.OPEN,
        unreadCount: 0,
        metadata: { pageId },
      });
    }

    // Create postback as a message (with duplicate check)
    const messageText = `[Postback: ${postback.title}]`;
    const postbackMessageId = `postback_${senderId}_${timestamp.getTime()}`;

    // Check for duplicate
    const existingPostback = await this.messageModel.findOne({
      platform: "facebook",
      platformMessageId: postbackMessageId,
    }).exec();

    if (existingPostback) {
      this.logger.log(`⏭️ Skipping duplicate postback: ${postbackMessageId}`);
      return;
    }

    let newMessage: MessageDocument;
    try {
      newMessage = await this.messageModel.create({
        conversationId: conversation._id,
        organizationId: conversation.organizationId,
        platform: "facebook",
        platformMessageId: postbackMessageId,
        direction: "inbound",
        type: "postback",
        content: {
          text: messageText,
          payload: postback.payload,
        },
        sender: {
          platformUserId: senderId,
          name: conversation.customerName,
        },
        status: MessageStatus.SENT,
        metadata: {
          rawPayload: event,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        this.logger.log(`⏭️ Skipping duplicate postback (E11000): ${postbackMessageId}`);
        return;
      }
      throw error;
    }

    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: messageText,
        timestamp: timestamp,
        senderId: senderId,
        messageId: newMessage._id,
      },
      $inc: { unreadCount: 1 },
    });

    this.logger.log(
      `✅ Postback recorded for conversation ${conversation._id}`
    );
  }

  /**
   * Handle comments on post (feed events)
   */
  async handleComments(
    change: FacebookChange,
    pageId: string,
    platformConnectionId: string,
    timestamp: Date,
    connection: PlatformConnectionDocument
  ): Promise<void> {
    const changeValue = change.value;

    // Only handle comment additions (ignore edits and removals for now)
    if (changeValue.verb !== 'add' && changeValue.verb !== undefined) {
      this.logger.debug(`Skipping comment event with verb: ${changeValue.verb}`);
      return;
    }

    const commenterId = changeValue.sender_id;
    const postId = changeValue.post_id;
    const commentId = changeValue.comment_id;
    const commentText = changeValue.message;

    if (!commenterId || !postId) {
      this.logger.warn('Comment missing required fields', {
        commenterId,
        postId,
        commentId,
      });
      return;
    }

    // Conversation key: postId_pageId (comments grouped by post)
    const conversationKey = `post_${postId}_${pageId}`;

    this.logger.log(`Processing comment on post ${postId} from user ${commenterId}`);

    let conversation = await this.conversationModel
      .findOne({
        platform: 'facebook',
        platformConversationId: conversationKey,
      })
      .exec();

    if (conversation) {
      // Update to new connection if it was reconnected
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
      // Create new conversation for this post
      conversation = await this.conversationModel.create({
        platform: 'facebook',
        platformConversationId: conversationKey,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        organizationId: connection.organizationId,
        platformAccountId: pageId,
        customerPlatformUserId: commenterId,
        customerName: changeValue.sender_name || `Facebook User ${commenterId}`,
        status: ConversationStatus.OPEN,
        unreadCount: 0,
        metadata: {
          pageId: pageId,
          postId: postId,
          type: 'post_comments',
        },
      });

      this.logger.log(
        `✅ Created new post comments conversation: ${conversation._id} for post ${postId}`
      );
    }

    // Create comment as a message (with duplicate check)
    const messageText = commentText || '[Comment]';
    const commentMessageId = commentId || `comment_${commenterId}_${timestamp.getTime()}`;

    // Check for duplicate
    const existingComment = await this.messageModel.findOne({
      platform: 'facebook',
      platformMessageId: commentMessageId,
    }).exec();

    if (existingComment) {
      this.logger.log(`⏭️ Skipping duplicate comment: ${commentMessageId}`);
      return;
    }

    let newMessage: MessageDocument;
    try {
      newMessage = await this.messageModel.create({
        conversationId: conversation._id,
        organizationId: conversation.organizationId,
        platform: 'facebook',
        platformMessageId: commentMessageId,
        direction: 'inbound',
        type: 'comment',
        content: {
          text: messageText,
        },
        sender: {
          platformUserId: commenterId,
          name: conversation.customerName,
        },
        status: MessageStatus.SENT,
        metadata: {
          rawPayload: changeValue,
          postId: postId,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        this.logger.log(`⏭️ Skipping duplicate comment (E11000): ${commentMessageId}`);
        return;
      }
      throw error;
    }

    this.logger.log(`✅ Comment saved: ${newMessage._id}`);

    // Update conversation's last message
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: messageText,
        timestamp: timestamp,
        senderId: commenterId,
        messageId: newMessage._id,
      },
      $inc: { unreadCount: 1 },
    });

    this.logger.log(
      `✅ Conversation updated: ${conversation._id} (unreadCount incremented)`
    );

    // Reload conversation to get updated unreadCount
    const updatedConversation = await this.conversationModel.findById(conversation._id).exec();

    // Publish WebSocket notification
    await this.publishWebSocketNotification(updatedConversation, newMessage);
  }

  /**
   * Publish WebSocket notification to Kafka
   * Kafka consumer will emit to Socket.IO clients (org-wide broadcast)
   */
  private async publishWebSocketNotification(
    conversation: ConversationDocument,
    message: MessageDocument
  ): Promise<void> {
    try {
      const organizationId = conversation.organizationId.toString();

      // Publish new message event to Kafka (broadcast to all org agents)
      const newMessageEvent: WebSocketNotificationEvent = {
        type: 'message:new',
        organizationId,
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
        key: organizationId, // Partition by organizationId
        value: newMessageEvent,
      });

      // Publish conversation updated event to Kafka
      const conversationEvent: WebSocketNotificationEvent = {
        type: 'conversation:updated',
        organizationId,
        payload: {
          _id: conversation._id.toString(),
          platform: conversation.platform,
          platformConversationId: conversation.platformConversationId,
          unreadCount: conversation.unreadCount,
          lastMessage: conversation.lastMessage,
        } as ConversationUpdatedPayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: organizationId, // Partition by organizationId
        value: conversationEvent,
      });

      this.logger.log(
        `📤 Published Kafka events for org ${organizationId} (conversation ${conversation._id})`
      );
    } catch (error) {
      this.logger.error("Failed to publish Kafka notification:", error);
    }
  }

  // ==================== OAuth Methods ====================

  /**
   * Generate Facebook OAuth authorization URL (Dialog endpoint)
   */
  getAuthorizationUrl(state?: string): {
    url: string;
    state: string;
  } {
    const finalState = state || randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'public_profile,email,pages_manage_metadata,pages_read_engagement,pages_show_list,pages_read_user_content,pages_manage_posts,pages_manage_engagement,pages_messaging,ads_read,ads_management,page_events,pages_manage_ads,catalog_management,leads_retrieval,business_management,pages_utility_messaging',
      state: finalState,
      auth_type: 'rerequest',
    });

    return {
      url: `https://www.facebook.com/${this.graphApiVersion}/dialog/oauth?${params.toString()}`,
      state: finalState,
    };
  }

  /**
   * Exchange authorization code for user access token
   */
  async exchangeCodeForToken(code: string): Promise<FacebookTokenResponse> {
    try {
      this.logger.log('=== Exchanging Facebook code for token - REQUEST ===');

      const params = new URLSearchParams({
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: this.redirectUri,
        code,
      });

      const response = await axios.post(
        `https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.logger.log('=== Exchanging Facebook code for token - RESPONSE ===');
      this.logger.log('Status:', response.status);

      if (response.data.error) {
        this.logger.error('❌ Facebook OAuth ERROR in response:');
        this.logger.error(`  Error type: ${response.data.error.type}`);
        this.logger.error(`  Error message: ${response.data.error.message}`);
        throw new BadRequestException(
          `Facebook OAuth error: ${response.data.error.message}`,
        );
      }

      if (!response.data.access_token) {
        this.logger.error('❌ Response missing access_token!');
        throw new BadRequestException('Facebook OAuth response missing access_token');
      }

      this.logger.log('✅ Token exchange SUCCESS');

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new BadRequestException('Failed to exchange authorization code');
    }
  }

  /**
   * Get list of pages for the authenticated user
   */
  async getPages(accessToken: string): Promise<FacebookPageInfo[]> {
    try {
      this.logger.log('Fetching Facebook pages list...');

      const response = await axios.get(
        `https://graph.facebook.com/${this.graphApiVersion}/me/accounts`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,access_token,picture.width(100).height(100)',
          },
        }
      );

      if (response.data.error) {
        throw new BadRequestException(
          `Failed to get pages: ${response.data.error.message}`,
        );
      }

      if (!response.data.data || response.data.data.length === 0) {
        this.logger.warn('User has no Facebook pages');
        return [];
      }

      this.logger.log(`✅ Retrieved ${response.data.data.length} Facebook pages`);
      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to get Facebook pages', error);
      throw new BadRequestException('Failed to fetch Facebook pages');
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(accessToken: string): Promise<FacebookUserInfo> {
    try {
      this.logger.log('Fetching Facebook user profile...');

      const response = await axios.get(
        `https://graph.facebook.com/${this.graphApiVersion}/me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,email,picture.width(100).height(100)',
          },
        }
      );

      if (response.data.error) {
        throw new BadRequestException(
          `Failed to get user profile: ${response.data.error.message}`,
        );
      }

      this.logger.log(`✅ Retrieved user profile: ${response.data.name}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get user profile', error);
      throw new BadRequestException('Failed to fetch Facebook user profile');
    }
  }

  /**
   * Save platform connection for a Facebook page
   */
  async savePlatformConnection(
    userId: string,
    organizationId: string,
    pageInfo: FacebookPageInfo,
  ): Promise<PlatformConnectionDocument> {
    if (!pageInfo.access_token) {
      this.logger.error('❌ Page does not have access_token');
      throw new BadRequestException('Page access token not available');
    }

    if (!pageInfo.id || !pageInfo.name) {
      this.logger.error('❌ Page missing required fields');
      throw new BadRequestException('Page missing required fields');
    }

    this.logger.log('=== Saving Facebook page platform connection ===');
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`Organization ID: ${organizationId}`);
    this.logger.log(`Page ID: ${pageInfo.id}`);
    this.logger.log(`Page Name: ${pageInfo.name}`);

    // Find by organizationId (multi-tenant) instead of userId
    let existing = await this.platformConnectionModel
      .findOne({
        organizationId: new Types.ObjectId(organizationId),
        platform: 'facebook',
        platformAccountId: pageInfo.id,
      })
      .exec();

    if (existing) {
      this.logger.log(`Found existing connection: ${existing._id}`);

      existing.platformAccountName = pageInfo.name;
      existing.credentials = {
        accessToken: pageInfo.access_token,
      };
      existing.status = ConnectionStatus.ACTIVE;
      existing.connectedBy = new Types.ObjectId(userId);
      existing.metadata = {
        ...existing.metadata,
        pageId: pageInfo.id,
        pageName: pageInfo.name,
        picture: pageInfo.picture,
        category: pageInfo.category,
      };
      existing.lastSyncAt = new Date();

      const savedConnection = await existing.save();

      this.logger.log(`✅ Updated existing connection: ${savedConnection._id}`);

      return savedConnection;
    }

    const newConnection = await this.platformConnectionModel.create({
      organizationId: new Types.ObjectId(organizationId),
      connectedBy: new Types.ObjectId(userId),
      platform: 'facebook',
      platformAccountId: pageInfo.id,
      platformAccountName: pageInfo.name,
      credentials: {
        accessToken: pageInfo.access_token,
      },
      status: ConnectionStatus.ACTIVE,
      metadata: {
        pageId: pageInfo.id,
        pageName: pageInfo.name,
        picture: pageInfo.picture,
        category: pageInfo.category,
      },
      lastSyncAt: new Date(),
    });

    this.logger.log(`✅ Created new connection: ${newConnection._id}`);

    return newConnection;
  }

  /**
   * Sync all pages for a user
   */
  async syncPagesForUser(userId: string): Promise<{ authUrl: string; state: string }> {
    this.logger.log(`Initiating page sync for user ${userId}`);

    const { url, state } = this.getAuthorizationUrl();

    return {
      authUrl: url,
      state,
    };
  }

  /**
   * Get sync status for user's Facebook pages
   */
  async getSyncStatus(userId: string): Promise<{
    connectedPages: number;
    lastSyncAt: Date | null;
  }> {
    const connections = await this.platformConnectionModel
      .find({
        userId: new Types.ObjectId(userId),
        platform: 'facebook',
        status: ConnectionStatus.ACTIVE,
      })
      .exec();

    const lastSyncAt = connections.length > 0
      ? connections.reduce((latest, conn) => {
          return conn.lastSyncAt > latest ? conn.lastSyncAt : latest;
        }, connections[0].lastSyncAt)
      : null;

    return {
      connectedPages: connections.length,
      lastSyncAt,
    };
  }

  /**
   * Sync conversations from Facebook page
   */
  async syncConversations(
    platformConnectionId: string,
  ): Promise<number> {
    try {
      this.logger.log(
        `Conversation sync for Facebook connection ${platformConnectionId}`,
      );

      this.logger.log('Note: Facebook conversations are synced via webhooks');

      return 0;
    } catch (error) {
      this.logger.error('Failed to sync conversations:', error);
      throw error;
    }
  }

  /**
   * Get sender profile information (name, avatar)
   */
  async getSenderProfile(
    pageAccessToken: string,
    senderId: string,
  ): Promise<{ id: string; name: string; profile_pic?: string }> {
    try {
      this.logger.log(`Fetching profile for Facebook user ${senderId}`);

      const response = await axios.get(
        `https://graph.facebook.com/${this.graphApiVersion}/${senderId}`,
        {
          headers: {
            Authorization: `Bearer ${pageAccessToken}`,
          },
          params: {
            fields: 'id,name,profile_pic',
          },
        }
      );

      if (response.data.error) {
        this.logger.error('Failed to get sender profile:', response.data.error);
        return {
          id: senderId,
          name: `Facebook User ${senderId}`,
        };
      }

      this.logger.log(`✅ Retrieved profile: ${response.data.name}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch sender profile:', error.message);
      return {
        id: senderId,
        name: `Facebook User ${senderId}`,
      };
    }
  }

  /**
   * Send text message to Facebook user
   */
  async sendTextMessage(
    pageAccessToken: string,
    recipientId: string,
    text: string,
  ): Promise<{ message_id: string }> {
    try {
      this.logger.log(`Sending text message to Facebook user ${recipientId}`);

      const response = await axios.post(
        `https://graph.facebook.com/${this.graphApiVersion}/me/messages`,
        {
          recipient: {
            id: recipientId,
          },
          message: {
            text,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${pageAccessToken}`,
          },
        }
      );

      if (response.data.error) {
        this.logger.error('Facebook send message error:', response.data.error);
        throw new BadRequestException(
          `Failed to send Facebook message: ${response.data.error.message}`,
        );
      }

      this.logger.log(`✅ Message sent successfully: ${response.data.message_id}`);

      return {
        message_id: response.data.message_id,
      };
    } catch (error) {
      if (error.response) {
        this.logger.error('Facebook API error response:', {
          status: error.response.status,
          data: error.response.data,
        });
      } else {
        this.logger.error('Failed to send message:', error.message);
      }
      throw new BadRequestException('Failed to send message to Facebook');
    }
  }
}
