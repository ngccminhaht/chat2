/**
 * Message Combiner
 * Combines batched messages into a format suitable for AI API requests
 */

import { MessageDocument } from "@/common/database/schemas/message.schema";
import { ConversationDocument } from "@/common/database/schemas/conversation.schema";
import { CustomerDocument } from "@/common/database/schemas/customer.schema";

export interface CombinedMessageData {
  texts: Array<{ content: string; timestamp: number }>;
  images: Array<{
    url: string;
    type: string;
    order: number;
    isPostImage?: boolean;
  }>;
  latestMessage: {
    conversation: ConversationDocument;
    conversationData?: any;
  };
}

export interface AIRequestData {
  query: string;
  inputs?: Record<string, any>;
  response_mode: "blocking" | "streaming";
  user: string;
  conversation_id?: string;
  files?: Array<{ type: string; url: string; transfer_method?: string }>;
}

export class MessageCombiner {
  /**
   * Get platform display name
   * For Facebook, distinguish between COMMENT and INBOX based on message metadata
   */
  private static getPlatformLabel(
    platform: string,
    conversation?: ConversationDocument,
    message?: MessageDocument
  ): string {
    const labels: Record<string, string> = {
      facebook: "Facebook",
      zalo: "Zalo",
      tiktok: "TikTok",
      shopee: "Shopee",
      web: "Web",
    };

    const baseLabel = labels[platform] || platform;

    // For Facebook, check if this specific message is a comment
    // ONLY check message metadata - do NOT use conversation metadata as fallback
    // Because inbox and comments share the same conversation, conversation metadata
    // will always have type: "post_comments" if there was a comment before
    if (platform === "facebook") {
      let isComment = false;

      if (message) {
        // Check message metadata for isComment flag - this is the ONLY source of truth
        const messageMetadata = (message as any).metadata || {};
        const rawPayload = messageMetadata.rawPayload || {};

        // Explicitly check for true (not just truthy) to avoid false positives
        // If isComment is undefined or false, treat as inbox message
        isComment =
          messageMetadata.isComment === true ||
          rawPayload.isComment === true ||
          false;
      }

      // DO NOT fallback to conversation metadata - it's unreliable
      // If message doesn't have isComment flag, default to INBOX (not COMMENT)
      const finalLabel = isComment ? "FACEBOOK:COMMENT" : "FACEBOOK:INBOX";

      return finalLabel;
    }

    return baseLabel;
  }

  /**
   * Combine batched messages into structured data
   */
  static combineMessages(
    messages: Array<{
      conversation: ConversationDocument;
      message: MessageDocument;
    }>
  ): CombinedMessageData {
    if (messages.length === 0) {
      throw new Error("Cannot combine empty messages array");
    }

    // Log all incoming messages for debugging
    console.log(
      `📥 [MessageCombiner] Received ${messages.length} messages to combine:`,
      messages.map((item, idx) => ({
        index: idx,
        messageId: (item.message as any)._id?.toString(),
        type: item.message.type,
        direction: (item.message as any).direction,
        hasText: !!item.message.content?.text,
        textPreview: item.message.content?.text?.substring(0, 50) || null,
        hasMediaUrl: !!item.message.content?.mediaUrl,
        createdAt: (item.message as any).createdAt,
      }))
    );

    const texts: Array<{ content: string; timestamp: number }> = [];
    const images: Array<{
      url: string;
      type: string;
      order: number;
      isPostImage?: boolean;
    }> = [];

    // Sort messages by timestamp
    const sortedMessages = [...messages].sort(
      (a, b) =>
        ((a.message as any).createdAt?.getTime() || 0) -
        ((b.message as any).createdAt?.getTime() || 0)
    );

    sortedMessages.forEach((item, index) => {
      const { message, conversation } = item;
      // Get platform from conversation or message, with fallback
      const platform = (conversation?.platform ||
        (message as any)?.platform ||
        "web") as string;
      const platformLabel = this.getPlatformLabel(
        platform,
        conversation,
        message
      );
      const sourcePrefix = `[from: ${platformLabel}]`;

      // Determine message direction
      const isInbound = (message as any).direction === "inbound";
      const isOutbound = (message as any).direction === "outbound";

      // Extract text content (skip media link patterns like [image: ...])
      if (message.content?.text) {
        let text = message.content.text.trim();
        // Skip if text is just a media link pattern (e.g., [image: ...], [Image: ...])
        const isMediaLinkPattern =
          /^\[(image|Image|video|Video|audio|Audio|file|File):\s*https?:\/\/.+\]$/i.test(
            text
          );
        if (!isMediaLinkPattern && text) {
          // Add prefix to distinguish sender
          if (isInbound && !text.startsWith(`[from: ${platformLabel}]`)) {
            // Inbound: add platform source prefix (inline, not newline)
            text = `${sourcePrefix} ${text}`;
          } else if (isOutbound && !text.startsWith("Agent:")) {
            // Outbound: add Agent prefix for clarity
            text = `Agent: ${text}`;
          }
          texts.push({
            content: text,
            timestamp: (message as any).createdAt?.getTime() || Date.now(),
          });
          console.log(
            `✅ [MessageCombiner] Added text from message ${(message as any)._id}:`,
            {
              direction: (message as any).direction,
              textPreview: text.substring(0, 100),
            }
          );
        } else if (isMediaLinkPattern) {
          console.log(
            `⏭️ [MessageCombiner] Skipped media link pattern in message ${(message as any)._id}:`,
            text.substring(0, 100)
          );
        } else {
          console.log(
            `⏭️ [MessageCombiner] Skipped empty text in message ${(message as any)._id}`
          );
        }
      } else if (isInbound && (message as any).type !== "text") {
        // For non-text inbound messages without text, add source with message type
        const typeLabels: Record<string, string> = {
          image: "Ảnh",
          video: "Video",
          file: "File",
          audio: "Audio",
          sticker: "Sticker",
          location: "Vị trí",
        };
        const typeLabel = typeLabels[message.type] || message.type;
        texts.push({
          content: `${sourcePrefix}\n[${typeLabel}]`,
          timestamp: (message as any).createdAt?.getTime() || Date.now(),
        });
        console.log(
          `📎 [MessageCombiner] Added media placeholder for message ${(message as any)._id}:`,
          {
            type: message.type,
            label: typeLabel,
          }
        );
      } else {
        console.log(
          `⚠️ [MessageCombiner] No text content in message ${(message as any)._id}:`,
          {
            hasText: !!message.content?.text,
            type: (message as any).type,
            direction: (message as any).direction,
            isInbound,
          }
        );
      }

      // Extract image/media content from ALL messages (not just type=image)
      // Facebook can send images with type=image OR with attachments in text messages
      if (message.content?.mediaUrl) {
        const messageType = message.type || "unknown";
        // Only process image and video types (not audio, file, sticker, etc.)
        if (messageType === "image" || messageType === "video") {
          images.push({
            url: message.content.mediaUrl,
            type: messageType,
            order: index,
          });
          console.log(
            `📸 [MessageCombiner] Found ${messageType} in message ${(message as any)._id}:`,
            {
              url: message.content.mediaUrl,
              order: index,
              messageType,
              direction: (message as any).direction,
            }
          );
        } else {
          console.log(
            `⏭️ [MessageCombiner] Skipped non-image/video media in message ${(message as any)._id}:`,
            {
              type: messageType,
              hasMediaUrl: true,
            }
          );
        }
      }
    });

    // Combine all text messages
    const combinedText = texts.map((t) => t.content).join("\n");

    console.log(
      `📊 [MessageCombiner] Combination complete:`,
      {
        totalMessagesReceived: messages.length,
        textsExtracted: texts.length,
        imagesExtracted: images.length,
        combinedTextLength: combinedText.length,
        textsPreview: texts.map((t, idx) => ({
          index: idx,
          preview: t.content.substring(0, 100),
        })),
      }
    );

    return {
      texts: combinedText
        ? [
            {
              content: combinedText,
              timestamp: texts[0]?.timestamp || Date.now(),
            },
          ]
        : [],
      images,
      latestMessage: {
        conversation:
          sortedMessages[sortedMessages.length - 1]?.conversation ||
          messages[0]?.conversation,
      },
    };
  }

  /**
   * Create AI request payload from combined message data
   */
  static createAIRequest(
    combinedData: CombinedMessageData,
    user: {
      username: string;
      _id: string;
      isCustomer?: boolean;
      facebookUserId?: string;
      pageId?: string;
    },
    customer?: CustomerDocument | null,
    maxImages?: number // Maximum number of images (from org settings, default: 6)
  ): AIRequestData {
    const { texts, images } = combinedData;
    let queryText = texts[0]?.content || "";

    // If there are images but no text query, add a default prompt to analyze the image
    if (images.length > 0 && !queryText.trim()) {
      queryText = "Hãy mô tả ảnh này và trả lời câu hỏi của khách hàng về ảnh.";
    }

    const requestData: AIRequestData = {
      query: queryText,
      inputs: {},
      response_mode: "streaming",
      user: user._id,
    };

    // Collect customer information for AI context
    let customerName = customer?.name || user.username;
    let customerGender: string | undefined;
    let customerPhone: string | undefined;
    let customerEmail: string | undefined;
    let customerBirthDate: string | undefined;

    // Add customer information to inputs if available
    if (customer) {
      customerEmail = customer.email;
      customerPhone = customer.phone;
      // Get gender from customer if available
      if ((customer as any).gender) {
        customerGender = (customer as any).gender;
      }
    }

    // Add Zalo profile information from conversation metadata if available
    const conversation = combinedData.latestMessage?.conversation;

    // Debug log
    console.log("🔍 [MessageCombiner] Conversation metadata:", {
      hasConversation: !!conversation,
      hasMetadata: !!conversation?.metadata,
      hasZaloProfile: !!conversation?.metadata?.zaloProfile,
      zaloProfile: conversation?.metadata?.zaloProfile,
      hasPostContent: !!conversation?.metadata?.postContent,
    });

    // Add Facebook post content to query for comment conversations
    if (
      conversation?.metadata?.type === "post_comments" &&
      conversation?.metadata?.postContent
    ) {
      const postContent = conversation.metadata.postContent as {
        message?: string;
        story?: string;
      };
      const postText = postContent.message || postContent.story;
      if (postText) {
        // Prepend post content to query so AI knows the context
        queryText = `[Bài viết gốc: ${postText}]\n\n ${queryText}`;
        console.log(
          `📄 [MessageCombiner] Added post content to AI context for comment conversation`
        );
      }
    }

    if (conversation?.metadata?.zaloProfile) {
      const zaloProfile = conversation.metadata.zaloProfile as Record<
        string,
        any
      >;

      // Override with Zalo profile data (more accurate)
      customerName =
        zaloProfile.display_name || zaloProfile.user_alias || customerName;

      // Convert gender from Zalo format (0: Nam, 1: Nữ)
      // Check both direct field and shared_info
      const genderValue = zaloProfile.gender ?? zaloProfile.shared_info?.gender;
      if (genderValue !== undefined && genderValue !== null) {
        customerGender =
          genderValue === 0 ? "Nam" : genderValue === 1 ? "Nữ" : "Khác";
      }

      // Get birth date from various possible fields
      customerBirthDate =
        zaloProfile.birth_date || zaloProfile.shared_info?.user_dob;
      if (customerBirthDate === "") customerBirthDate = undefined;

      // Get phone from shared_info (Zalo format)
      const phoneValue = zaloProfile.phone || zaloProfile.shared_info?.phone;
      if (phoneValue && phoneValue !== 0 && phoneValue !== "0") {
        customerPhone = phoneValue.toString();
      }

      // Debug log
      console.log("🔍 [MessageCombiner] Extracted customer info:", {
        customerName,
        customerGender,
        customerPhone,
        customerBirthDate,
        rawGender: genderValue,
        rawPhone: phoneValue,
      });

      // Store full Zalo profile for additional context
      requestData.inputs.zalo_profile = zaloProfile;
    } else if (conversation?.platform === "facebook") {
      // For Facebook, try to get gender from conversation metadata or customer
      // Facebook gender is stored in userProfile metadata when fetched
      const facebookProfile = conversation.metadata?.facebookProfile as
        | Record<string, any>
        | undefined;

      if (facebookProfile?.gender) {
        customerGender = facebookProfile.gender;
      } else if (!customerGender && conversation.customerName) {
        // Try to get from customer if available (gender might be stored in customFields)
        // This is a fallback - ideally gender should be in metadata
      }
    }

    // Build customer context string for AI
    const customerContext: string[] = [];
    customerContext.push(`Tên: ${customerName}`);
    if (customerGender) {
      customerContext.push(`Giới tính: ${customerGender}`);
    }
    if (customerPhone) {
      customerContext.push(`SĐT: ${customerPhone}`);
    }
    if (customerEmail) {
      customerContext.push(`Email: ${customerEmail}`);
    }
    if (customerBirthDate) {
      customerContext.push(`Ngày sinh: ${customerBirthDate}`);
    }
    // Add conversation ID for tracking
    if (conversation?._id) {
      customerContext.push(`Conversation ID: ${conversation._id.toString()}`);
    }

    // Add customer info to inputs
    requestData.inputs = {
      ...requestData.inputs,
      customer_name: customerName,
      customer_gender: customerGender,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      customer_birth_date: customerBirthDate,
      // Thông tin khách hàng dạng text để AI dễ hiểu
      customer_info: customerContext.join(" | "),
      // Conversation ID từ hệ thống MiAgent (MongoDB _id)
      miagent_conversation_id: conversation?._id?.toString(),
    };

    // Chèn thông tin khách hàng trực tiếp vào đầu tin nhắn
    const customerInfoPrefix = `[Thông tin khách hàng: ${customerContext.join(
      " | "
    )}]\n\n`;
    requestData.query = customerInfoPrefix + queryText;

    // Add files (images) if any
    // Wrap image URLs through middleware proxy
    if (images.length > 0) {
      const maxImagesLimit = maxImages || 6; // Use org setting or default to 6
      const imagesToSend = images
        .sort((a, b) => a.order - b.order)
        .slice(0, maxImagesLimit);

      console.log(
        `📸 [MessageCombiner] Processing images for AI request:`,
        {
          totalImages: images.length,
          maxImagesLimit,
          imagesToSendCount: imagesToSend.length,
          allImages: images.map((img, idx) => ({
            index: idx,
            order: img.order,
            type: img.type,
            originalUrl: img.url,
          })),
        }
      );

      requestData.files = imagesToSend.map((img, idx) => {
        // Encode original URL to base64
        const base64URL = Buffer.from(img.url, "utf8").toString("base64");
        // Wrap through middleware proxy
        const proxiedUrl = `https://middleware.ictuer.workers.dev/tuha${base64URL}.webp`;

        console.log(
          `🔄 [MessageCombiner] Image ${idx + 1}/${imagesToSend.length}:`,
          {
            type: img.type,
            originalUrl: img.url,
            base64Length: base64URL.length,
            proxiedUrl: proxiedUrl,
          }
        );

        return {
          type: img.type, // Use actual type (image or video)
          transfer_method: "remote_url", // Required by MiAgent API
          url: proxiedUrl,
        };
      });

      console.log(
        `✅ [MessageCombiner] Final files array for AI request:`,
        JSON.stringify(requestData.files, null, 2)
      );
    } else {
      console.log(
        `⚠️ [MessageCombiner] No images found to send to AI - images array is empty`
      );
    }

    return requestData;
  }
}
