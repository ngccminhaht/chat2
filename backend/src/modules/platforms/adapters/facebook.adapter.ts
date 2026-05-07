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

    // Log referral info for debugging (private reply to comment detection)
    if (messaging.referral) {
      this.logger.log(
        `📎 Messaging event has referral: ${JSON.stringify(messaging.referral)}`
      );
    }

    if (messaging.message) {
      // Skip echo messages
      if (messaging.message.is_echo) {
        return null;
      }

      const messageType = this.determineMessageType(messaging.message);
      const content = this.extractMessageContent(messaging.message);

      // Check if this messaging event is related to a comment (private reply context)
      // Facebook may include referral with comment context for private replies
      const hasCommentContext =
        messaging.referral?.source === "COMMENT" ||
        (messaging as any).comment_id;

      // Ensure inbox messages have isComment: false explicitly
      // Unless it has comment context (private reply to a comment)
      const rawPayload = {
        ...messaging,
        isComment: hasCommentContext, // Mark based on comment context
        isPrivateReply: hasCommentContext, // Track if this is a private reply
      };

      return {
        type: "message",
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        messageId: messaging.message.mid,
        messageType,
        content,
        rawPayload,
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
    // Facebook feed webhooks can have different item types: comment, post, share, reaction, etc.
    // We only process comments (item === "comment" or missing item field for legacy compatibility)
    // Reference: https://developers.facebook.com/docs/graph-api/webhooks/reference/page/#feed
    if (value.item && value.item !== "comment") {
      this.logger.debug(`Skipping non-comment feed event: item=${value.item}`);
      return null;
    }

    // Only handle new comments (verb === "add" or undefined)
    // Skip edits and removals
    // Reference: verb can be "add", "edit", "edited", "remove", "delete"
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

    // Skip ALL comments from the page itself (page owner)
    // We only want to process comments from customers, not from the page
    if (commenterId === pageId) {
      this.logger.log(
        `⏭️ Skipping comment from page itself: commenterId=${commenterId} (pageId=${pageId}), post_id=${postId} - only process customer comments`
      );
      return null;
    }

    // Ensure postId is available in both snake_case and camelCase for compatibility
    // parent_id indicates: if parent_id === post_id -> top-level comment, else -> reply to another comment
    const rawPayload = {
      ...value,
      postId: postId, // Add camelCase version
      post_id: postId, // Keep snake_case version
      parent_id: value.parent_id || postId, // Default to post_id if not provided (top-level comment)
      sender_id: commenterId, // Normalize to sender_id for consistency
      sender_name: commenterName, // Normalize to sender_name for consistency
      isComment: true,
      isReply: value.parent_id && value.parent_id !== postId, // true if replying to another comment
    };

    this.logger.log(
      `✅ Parsing comment event: postId=${postId}, commenterId=${commenterId}, commenterName=${commenterName}, commentId=${commentId}`
    );
    this.logger.log(
      `  📌 rawPayload.isComment=${rawPayload.isComment}, rawPayload.isReply=${rawPayload.isReply}`
    );

    // Return as PlatformEvent with message-like properties for unified processing
    const event = {
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

    this.logger.log(
      `  📤 Returning comment event with isComment=${(event.rawPayload as any)?.isComment}`
    );

    return event;
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

    const rawPayload = event.rawPayload as any;
    const isComment = rawPayload?.isComment || false;

    // Debug log for isComment
    this.logger.log(
      `🔍 normalizeMessage: messageId=${event.messageId}, rawPayload.isComment=${rawPayload?.isComment}, isComment=${isComment}`
    );
    this.logger.log(
      `  rawPayload keys: ${rawPayload ? Object.keys(rawPayload).join(", ") : "none"}`
    );

    // Extract comment context from rawPayload
    const postId = rawPayload?.postId || rawPayload?.post_id;
    const commentId = rawPayload?.comment_id;
    const parentId = rawPayload?.parent_id;
    const isReply = rawPayload?.isReply || false;

    const normalized = {
      platform: this.platform,
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
        isComment: isComment, // Explicitly set isComment flag
        // Comment context - only set if it's a comment
        ...(isComment && {
          postId,
          commentId,
          parentId,
          isReply,
        }),
      },
    };

    this.logger.log(
      `  ✅ normalized.metadata: isComment=${normalized.metadata.isComment}, postId=${postId}, commentId=${commentId}`
    );

    return normalized;
  }

  getConversationKey(
    senderId: string,
    recipientId: string,
    payload?: unknown
  ): string {
    // Always use senderId_pageId for conversation key
    // This ensures inbox messages and comments from same user go to same conversation
    const conversationKey = `${senderId}_${recipientId}`;

    if (payload) {
      const payloadAny = payload as any;
      const postId = payloadAny.postId || payloadAny.post_id;
      if (postId) {
        this.logger.log(
          `🔑 Comment conversation key: ${conversationKey} (senderId=${senderId}, pageId=${recipientId}, postId=${postId})`
        );
      } else {
        this.logger.log(
          `🔑 Inbox conversation key: ${conversationKey} (senderId=${senderId}, pageId=${recipientId})`
        );
      }
    }

    return conversationKey;
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
      const text = (payload.message as any)?.text;

      // Facebook has a 2000 character limit per message. Split if it's a text message.
      if (text && text.length > 2000) {
        this.logger.warn(
          `Message exceeds Facebook's 2000 char limit (length: ${text.length}). Splitting into chunks.`
        );

        const MAX_LENGTH = 1990;
        const chunks: string[] = [];
        let remainingText = text;

        while (remainingText.length > 0) {
          if (remainingText.length <= MAX_LENGTH) {
            chunks.push(remainingText);
            break;
          }

          // Try to break at a double newline first (paragraph)
          let splitIndex = remainingText.lastIndexOf("\n\n", MAX_LENGTH);
          if (splitIndex <= 0) splitIndex = remainingText.lastIndexOf("\n", MAX_LENGTH);
          if (splitIndex <= 0) splitIndex = remainingText.lastIndexOf(" ", MAX_LENGTH);
          if (splitIndex <= 0) splitIndex = MAX_LENGTH;

          chunks.push(remainingText.substring(0, splitIndex));
          remainingText = remainingText.substring(splitIndex).trimStart();
        }

        let lastMessageId = "";
        for (let i = 0; i < chunks.length; i++) {
          const response = await axios.post(
            `https://graph.facebook.com/${this.graphApiVersion}/me/messages`,
            {
              recipient: { id: recipientId },
              message: { text: chunks[i] },
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
          lastMessageId = response.data.message_id;

          // Small delay to ensure order
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
        }

        return {
          success: true,
          platformMessageId: lastMessageId,
        };
      }

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
            fields: "id,name,picture.width(200).height(200),gender",
          },
        }
      );

      if (response.data.error) {
        return this.createDefaultProfile(userId, "Facebook");
      }

      // Extract avatar URL from picture object
      const avatarUrl =
        response.data.picture?.data?.url || response.data.profile_pic;

      // Convert Facebook gender to Vietnamese format
      // Facebook returns: "male", "female", or custom values
      let gender: string | undefined;
      if (response.data.gender) {
        const fbGender = response.data.gender.toLowerCase();
        if (fbGender === "male") {
          gender = "Nam";
        } else if (fbGender === "female") {
          gender = "Nữ";
        } else {
          gender = "Khác";
        }
      }

      return {
        id: response.data.id,
        name: response.data.name,
        avatar: avatarUrl,
        gender: gender,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Facebook profile for ${userId}: ${error.message}`
      );
      return this.createDefaultProfile(userId, "Facebook");
    }
  }
}
