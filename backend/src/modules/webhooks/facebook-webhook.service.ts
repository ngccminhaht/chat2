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
import {
  FacebookWebhookDto,
  FacebookMessagingEvent,
  FacebookChange,
  FacebookChangeValue,
} from "./dto/facebook-webhook.dto";

@Injectable()
export class FacebookWebhookService {
  private readonly logger = new Logger(FacebookWebhookService.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>
  ) {}

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
            platformConnectionId
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
              new Date(entry.time)
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
    platformConnectionId: string
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
          timestamp
        );
      } else if (event.delivery) {
        await this.handleDelivery(event, timestamp);
      } else if (event.read) {
        await this.handleRead(event, timestamp);
      } else if (event.postback) {
        await this.handlePostback(event, pageId, platformConnectionId, timestamp);
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
    timestamp: Date
  ): Promise<void> {
    const senderId = event.sender.id;
    const message = event.message;

    if (!message) return;

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

    if (!conversation) {
      // Create new conversation
      const displayName = `Facebook User ${senderId}`;

      conversation = await this.conversationModel.create({
        platform: "facebook",
        platformConversationId: conversationKey,
        platformConnectionId: new Types.ObjectId(platformConnectionId),
        platformAccountId: pageId, // Store Page ID for easy querying
        participants: [
          {
            platformUserId: senderId,
            name: displayName,
            role: "customer",
          },
        ],
        status: "open",
        unreadCount: 0,
        metadata: {
          pageId: pageId,
        },
      });

      this.logger.log(
        `✅ Created new conversation: ${conversation._id} for Facebook user ${senderId} and page ${pageId}`
      );
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

    // Create message
    const messageId = message.mid;

    this.logger.log("Creating message in database:", {
      conversationId: conversation._id,
      messageType,
      text: messageText,
      senderId: senderId,
    });

    const newMessage = await this.messageModel.create({
      conversationId: conversation._id,
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
        name:
          conversation.participants[0]?.name ||
          `Facebook User ${senderId}`,
      },
      status: "sent",
      metadata: {
        rawPayload: event,
      },
    });

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

    // TODO: Emit WebSocket event for real-time update
    // TODO: Publish to Kafka topic 'messages.incoming'
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
        { status: "delivered" }
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
        { status: "read" }
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
    timestamp: Date
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
        platformAccountId: pageId,
        participants: [
          {
            platformUserId: senderId,
            name: `Facebook User ${senderId}`,
            role: "customer",
          },
        ],
        status: "open",
        unreadCount: 0,
        metadata: { pageId },
      });
    }

    // Create postback as a message
    const messageText = `[Postback: ${postback.title}]`;

    const newMessage = await this.messageModel.create({
      conversationId: conversation._id,
      platform: "facebook",
      platformMessageId: `postback_${senderId}_${timestamp.getTime()}`,
      direction: "inbound",
      type: "postback",
      content: {
        text: messageText,
        payload: postback.payload,
      },
      sender: {
        platformUserId: senderId,
        name: conversation.participants[0]?.name || `Facebook User ${senderId}`,
      },
      status: "sent",
      metadata: {
        rawPayload: event,
      },
    });

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
    timestamp: Date
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
        platformAccountId: pageId,
        participants: [
          {
            platformUserId: commenterId,
            name: changeValue.sender_name || `Facebook User ${commenterId}`,
            role: 'customer',
          },
        ],
        status: 'open',
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

    // Create comment as a message
    const messageText = commentText || '[Comment]';

    const newMessage = await this.messageModel.create({
      conversationId: conversation._id,
      platform: 'facebook',
      platformMessageId: commentId || `comment_${commenterId}_${timestamp.getTime()}`,
      direction: 'inbound',
      type: 'comment',
      content: {
        text: messageText,
      },
      sender: {
        platformUserId: commenterId,
        name:
          conversation.participants[0]?.name ||
          changeValue.sender_name ||
          `Facebook User ${commenterId}`,
      },
      status: 'sent',
      metadata: {
        rawPayload: changeValue,
        postId: postId,
      },
    });

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

    // TODO: Emit WebSocket event for real-time update
    // TODO: Publish to Kafka topic 'messages.incoming'
  }
}
