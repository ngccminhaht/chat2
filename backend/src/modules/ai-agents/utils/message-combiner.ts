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
      const { message } = item;

      // Extract text content (skip media link patterns like [image: ...])
      if (message.content?.text) {
        const text = message.content.text.trim();
        // Skip if text is just a media link pattern (e.g., [image: ...], [Image: ...])
        const isMediaLinkPattern =
          /^\[(image|Image|video|Video|audio|Audio|file|File):\s*https?:\/\/.+\]$/i.test(
            text
          );
        if (!isMediaLinkPattern) {
          texts.push({
            content: text,
            timestamp: (message as any).createdAt?.getTime() || Date.now(),
          });
        }
      }

      // Extract image/media content
      if (message.content?.mediaUrl && message.type === "image") {
        images.push({
          url: message.content.mediaUrl,
          type: "image",
          order: index,
        });
      }
    });

    // Combine all text messages
    const combinedText = texts.map((t) => t.content).join("\n");

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
    maxImages?: number // Maximum number of images (from org settings, default: 3)
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
    }

    // Add Zalo profile information from conversation metadata if available
    const conversation = combinedData.latestMessage?.conversation;

    // Debug log
    console.log("🔍 [MessageCombiner] Conversation metadata:", {
      hasConversation: !!conversation,
      hasMetadata: !!conversation?.metadata,
      hasZaloProfile: !!conversation?.metadata?.zaloProfile,
      zaloProfile: conversation?.metadata?.zaloProfile,
    });

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
    } else {
      console.log(
        "⚠️ [MessageCombiner] No Zalo profile found in conversation metadata"
      );
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
    };

    // Chèn thông tin khách hàng trực tiếp vào đầu tin nhắn
    const customerInfoPrefix = `[Thông tin khách hàng: ${customerContext.join(
      " | "
    )}]\n\n`;
    requestData.query = customerInfoPrefix + queryText;

    // Add files (images) if any
    // Wrap image URLs through middleware proxy
    if (images.length > 0) {
      const maxImagesLimit = maxImages || 3; // Use org setting or default to 3
      const imagesToSend = images
        .sort((a, b) => a.order - b.order)
        .slice(0, maxImagesLimit);

      requestData.files = imagesToSend.map((img) => {
        // Encode original URL to base64
        const base64URL = Buffer.from(img.url, "utf8").toString("base64");
        // Wrap through middleware proxy
        const proxiedUrl = `https://middleware.ictuer.workers.dev/tuha${base64URL}.webp`;

        return {
          type: "image",
          transfer_method: "remote_url", // Required by MiAgent API
          url: proxiedUrl,
        };
      });
    }

    return requestData;
  }
}
