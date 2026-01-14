/**
 * Facebook Messenger Platform Adapter
 * Implements IPlatformAdapter for Facebook-specific logic
 */

import { Injectable, Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import axios from "axios";
import { Platform, MessageType, MessageDirection } from "@/common/constants";
import { EnvService } from "@/common/env";
import { PlatformConnectionDocument } from "@/common/database/schemas/platform-connection.schema";
import {
  IPlatformAdapter,
  BasePlatformAdapter,
  PlatformEvent,
  MessageEvent,
  DeliveryEvent,
  ReadEvent,
  PostbackEvent,
  NormalizedMessage,
  OutboundMessage,
  PlatformPayload,
  SendResult,
  UserProfile,
} from "../core/interfaces";
import {
  FacebookWebhookDto,
  FacebookMessagingEvent,
  FacebookAttachment,
} from "../facebook/dto/facebook-webhook.dto";

@Injectable()
export class FacebookAdapter extends BasePlatformAdapter {
  readonly platform = Platform.FACEBOOK;
  private readonly logger = new Logger(FacebookAdapter.name);
  private readonly graphApiVersion = "v19.0";
  private readonly appSecret: string;

  constructor(private readonly envService: EnvService) {
    super();
    this.appSecret = this.envService.get("FACEBOOK_APP_SECRET");
  }

  // ==================== Webhook Verification ====================

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature) {
      return false;
    }

    // Facebook signature format: sha256=<hash>
    const parts = signature.split("=");
    if (parts.length !== 2 || parts[0] !== "sha256") {
      return false;
    }

    const hmac = createHmac("sha256", secret || this.appSecret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest("hex");

    return calculatedSignature === parts[1];
  }

  // ==================== Webhook Parsing ====================

  extractAccountId(payload: unknown): string {
    const fbPayload = payload as FacebookWebhookDto;
    return fbPayload.entry?.[0]?.id || "unknown";
  }

  extractEvents(payload: unknown): PlatformEvent[] {
    const fbPayload = payload as FacebookWebhookDto;
    const events: PlatformEvent[] = [];

    if (fbPayload.object !== "page") {
      this.logger.warn(`Skipping non-page webhook object: ${fbPayload.object}`);
      return events;
    }

    this.logger.log(`🔍 Extracting events from Facebook webhook`);
    this.logger.log(`  Entries: ${fbPayload.entry?.length || 0}`);

    for (const entry of fbPayload.entry || []) {
      const pageId = entry.id;
      const timestamp = new Date(entry.time);

      this.logger.log(
        `  Processing entry: Page ${pageId}, Time: ${timestamp.toISOString()}`
      );

      // Process messaging events
      const messagingCount = entry.messaging?.length || 0;
      if (messagingCount > 0) {
        this.logger.log(`    📨 Found ${messagingCount} messaging events`);
      }
      for (const messaging of entry.messaging || []) {
        const event = this.parseMessagingEvent(messaging, pageId, timestamp);
        if (event) {
          events.push(event);
          this.logger.log(`      ✅ Parsed messaging event: ${event.type}`);
        }
      }

      // Process feed/comments events
      const changesCount = entry.changes?.length || 0;
      if (changesCount > 0) {
        this.logger.log(`    🔄 Found ${changesCount} changes events`);
      }
      for (const change of entry.changes || []) {
        this.logger.log(`      Change field: ${change.field}`);
        if (change.field === "comments" || change.field === "feed") {
          this.logger.log(`      💬 Processing comment/feed event:`);
          this.logger.log(`        Value: ${JSON.stringify(change.value)}`);
          const event = this.parseCommentEvent(change.value, pageId, timestamp);
          if (event) {
            events.push(event);
            this.logger.log(
              `        ✅ Parsed comment event: postId=${
                (change.value as any).post_id
              }, commenterId=${(change.value as any).sender_id}`
            );
          } else {
            this.logger.log(
              `        ⏭️  Comment event skipped (verb=${
                (change.value as any).verb
              })`
            );
          }
        }
      }
    }

    this.logger.log(`  📊 Total events extracted: ${events.length}`);
    return events;
  }

  private parseMessagingEvent(
    messaging: FacebookMessagingEvent,
    pageId: string,
    timestamp: Date
  ): PlatformEvent | null {
    const senderId = messaging.sender.id;
    const recipientId = messaging.recipient.id;
    const eventTimestamp = new Date(messaging.timestamp);

    if (messaging.message) {
      // Skip echo messages
      if (messaging.message.is_echo) {
        return null;
      }

      const messageType = this.determineMessageType(messaging.message);
      const content = this.extractMessageContent(messaging.message);

      return {
        type: "message",
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        messageId: messaging.message.mid,
        messageType,
        content,
        rawPayload: messaging,
      } as MessageEvent;
    }

    if (messaging.delivery) {
      return {
        type: "delivery",
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        messageIds: messaging.delivery.mids || [],
        watermark: messaging.delivery.watermark,
        rawPayload: messaging,
      } as DeliveryEvent;
    }

    if (messaging.read) {
      return {
        type: "read",
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        watermark: messaging.read.watermark,
        rawPayload: messaging,
      } as ReadEvent;
    }

    if (messaging.postback) {
      return {
        type: "postback",
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        messageId: `postback_${senderId}_${eventTimestamp.getTime()}`,
        messageType: MessageType.TEXT,
        title: messaging.postback.title,
        payload: messaging.postback.payload,
        content: {
          text: `[Postback: ${messaging.postback.title}]`,
        },
        rawPayload: messaging,
      } as PostbackEvent & MessageEvent;
    }

    return null;
  }

  private parseCommentEvent(
    value: any,
    pageId: string,
    timestamp: Date
  ): PlatformEvent | null {
    // Only handle new comments (verb === "add" or undefined)
    // Skip edits and removals
    if (value.verb && value.verb !== "add") {
      this.logger.debug(`Skipping comment event with verb: ${value.verb}`);
      return null;
    }

    // Facebook can send comment events in different formats:
    // Format 1: sender_id, sender_name (older format)
    // Format 2: from.id, from.name (newer format)
    const commenterId = value.sender_id || value.from?.id;
    const commenterName = value.sender_name || value.from?.name;
    const commentId = value.comment_id;
    const postId = value.post_id;

    if (!commenterId || !postId) {
      this.logger.warn(
        `Comment event missing required fields: commenterId=${commenterId}, postId=${postId}`
      );
      this.logger.warn(`Full value: ${JSON.stringify(value)}`);
      return null;
    }

    // Skip comments from the page itself ONLY if it's a reply to another comment (not the post)
    // parent_id can be either:
    // - post_id (when commenting directly on post) → ALLOW (top-level comment)
    // - comment_id (when replying to another comment) → SKIP (AI/agent reply)
    // We check if parent_id === post_id to determine if it's a top-level comment
    if (commenterId === pageId) {
      const isReplyToComment = value.parent_id && value.parent_id !== postId;
      if (isReplyToComment) {
        this.logger.log(
          `⏭️ Skipping comment reply from page itself: commenterId=${commenterId} (pageId=${pageId}), parent_id=${value.parent_id}, post_id=${postId} - this is a reply to another comment (AI/agent reply)`
        );
        return null;
      }
      // Allow top-level comments from page (parent_id === post_id or no parent_id)
      this.logger.log(
        `💬 Allowing top-level comment from page: commenterId=${commenterId} (pageId=${pageId}), parent_id=${value.parent_id}, post_id=${postId} - this is a direct comment on post`
      );
    }

    // Ensure postId is available in both snake_case and camelCase for compatibility
    const rawPayload = {
      ...value,
      postId: postId, // Add camelCase version
      post_id: postId, // Keep snake_case version
      sender_id: commenterId, // Normalize to sender_id for consistency
      sender_name: commenterName, // Normalize to sender_name for consistency
      isComment: true,
    };

    this.logger.log(
      `✅ Parsing comment event: postId=${postId}, commenterId=${commenterId}, commenterName=${commenterName}, commentId=${commentId}`
    );

    // Return as PlatformEvent with message-like properties for unified processing
    return {
      type: "message", // Treat comments as messages for unified processing
      senderId: commenterId,
      recipientId: pageId,
      timestamp,
      messageId: commentId || `comment_${commenterId}_${timestamp.getTime()}`,
      messageType: MessageType.TEXT,
      content: {
        text: value.message || "[Comment]",
      },
      rawPayload,
    } as MessageEvent;
  }

  private determineMessageType(message: any): MessageType {
    if (message.attachments && message.attachments.length > 0) {
      return this.mapAttachmentType(message.attachments[0].type);
    }
    if (message.sticker) {
      return MessageType.STICKER;
    }
    return MessageType.TEXT;
  }

  private extractMessageContent(message: any): MessageEvent["content"] {
    const content: MessageEvent["content"] = {};

    if (message.text) {
      content.text = message.text;
    }

    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0] as FacebookAttachment;
      content.mediaUrl = attachment.payload?.url;
      content.mediaType = attachment.type;

      if (attachment.type === "location" && attachment.payload?.coordinates) {
        content.location = {
          latitude: attachment.payload.coordinates.lat,
          longitude: attachment.payload.coordinates.long,
        };
        content.text = `[Location: ${content.location.latitude}, ${content.location.longitude}]`;
      }
      // Don't set text for image/video/audio/file attachments - let frontend handle display
      // Only keep text if user actually sent text along with the attachment
    }

    return content;
  }

  // ==================== Message Normalization ====================

  normalizeMessage(event: MessageEvent): NormalizedMessage {
    const conversationKey = this.getConversationKey(
      event.senderId,
      event.recipientId,
      event.rawPayload
    );

    return {
      platformMessageId: event.messageId,
      conversationKey,
      direction: MessageDirection.INBOUND,
      type: event.messageType,
      senderId: event.senderId,
      recipientId: event.recipientId,
      content: event.content,
      timestamp: event.timestamp,
      metadata: {
        rawPayload: event.rawPayload,
      },
    };
  }

  getConversationKey(
    senderId: string,
    recipientId: string,
    payload?: unknown
  ): string {
    // For comments, use post-based conversation key
    // Handle both camelCase (postId) and snake_case (post_id) for compatibility
    if (payload) {
      const payloadAny = payload as any;
      const postId = payloadAny.postId || payloadAny.post_id;
      if (postId) {
        const conversationKey = `post_${postId}_${recipientId}`;
        this.logger.log(
          `🔑 Creating post-based conversation key: ${conversationKey} (postId=${postId}, pageId=${recipientId})`
        );
        return conversationKey;
      }
    }
    // For direct messages: senderId_pageId
    return `${senderId}_${recipientId}`;
  }

  // ==================== Outbound Messages ====================

  formatOutbound(message: OutboundMessage): PlatformPayload {
    const payload: PlatformPayload = {};

    if (message.type === MessageType.TEXT && message.content.text) {
      payload.message = {
        text: message.content.text,
      };
    } else if (message.content.mediaUrl) {
      payload.message = {
        attachment: {
          type: this.mapMessageTypeToFacebook(message.type),
          payload: {
            url: message.content.mediaUrl,
            is_reusable: true,
          },
        },
      };
    }

    return payload;
  }

  private mapMessageTypeToFacebook(type: MessageType): string {
    const typeMap: Record<MessageType, string> = {
      [MessageType.TEXT]: "text",
      [MessageType.IMAGE]: "image",
      [MessageType.VIDEO]: "video",
      [MessageType.AUDIO]: "audio",
      [MessageType.FILE]: "file",
      [MessageType.STICKER]: "image",
      [MessageType.LOCATION]: "template",
      [MessageType.TEMPLATE]: "template",
      [MessageType.QUICK_REPLY]: "text",
      [MessageType.UNKNOWN]: "text",
    };
    return typeMap[type] || "text";
  }

  async send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload
  ): Promise<SendResult> {
    try {
      const accessToken = connection.credentials.accessToken;

      const response = await axios.post(
        `https://graph.facebook.com/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: recipientId },
          ...payload,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.data.error) {
        return {
          success: false,
          error: response.data.error.message,
        };
      }

      return {
        success: true,
        platformMessageId: response.data.message_id,
      };
    } catch (error) {
      this.logger.error(
        "Facebook send failed:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  // ==================== User Profile ====================

  async fetchUserProfile(
    connection: PlatformConnectionDocument,
    userId: string
  ): Promise<UserProfile> {
    try {
      const accessToken = connection.credentials.accessToken;

      const response = await axios.get(
        `https://graph.facebook.com/${this.graphApiVersion}/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: "id,name,profile_pic",
          },
        }
      );

      if (response.data.error) {
        return this.createDefaultProfile(userId, "Facebook");
      }

      return {
        id: response.data.id,
        name: response.data.name,
        avatar: response.data.profile_pic,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Facebook profile for ${userId}: ${error.message}`
      );
      return this.createDefaultProfile(userId, "Facebook");
    }
  }
}
