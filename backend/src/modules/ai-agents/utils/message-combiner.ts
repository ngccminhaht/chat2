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
  files?: Array<{ type: string; url: string }>;
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

      // Extract text content
      if (message.content?.text) {
        texts.push({
          content: message.content.text,
          timestamp: (message as any).createdAt?.getTime() || Date.now(),
        });
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
    customer?: CustomerDocument | null
  ): AIRequestData {
    const { texts, images } = combinedData;
    const queryText = texts[0]?.content || "";

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
    if (conversation?.metadata?.zaloProfile) {
      const zaloProfile = conversation.metadata.zaloProfile as Record<
        string,
        any
      >;

      // Override with Zalo profile data (more accurate)
      customerName =
        zaloProfile.display_name || zaloProfile.user_alias || customerName;

      // Convert gender from Zalo format (0: Nam, 1: Nữ)
      if (zaloProfile.gender !== undefined) {
        customerGender =
          zaloProfile.gender === 0
            ? "Nam"
            : zaloProfile.gender === 1
            ? "Nữ"
            : "Khác";
      }

      customerBirthDate = zaloProfile.birth_date;
      if (zaloProfile.phone) {
        customerPhone = zaloProfile.phone;
      }

      // Store full Zalo profile for additional context
      requestData.inputs.zalo_profile = zaloProfile;
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

    // Add files (images) if any
    if (images.length > 0) {
      requestData.files = images
        .sort((a, b) => a.order - b.order)
        .map((img) => ({
          type: img.type,
          url: img.url,
        }));
    }

    return requestData;
  }
}
