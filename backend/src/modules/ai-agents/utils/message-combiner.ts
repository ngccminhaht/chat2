/**
 * Message Combiner
 * Combines batched messages into a format suitable for AI API requests
 */

import { MessageDocument } from '@/common/database/schemas/message.schema';
import { ConversationDocument } from '@/common/database/schemas/conversation.schema';
import { CustomerDocument } from '@/common/database/schemas/customer.schema';

export interface CombinedMessageData {
  texts: Array<{ content: string; timestamp: number }>;
  images: Array<{ url: string; type: string; order: number; isPostImage?: boolean }>;
  latestMessage: {
    conversation: ConversationDocument;
    conversationData?: any;
  };
}

export interface AIRequestData {
  query: string;
  inputs?: Record<string, any>;
  response_mode: 'blocking' | 'streaming';
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
    }>,
  ): CombinedMessageData {
    if (messages.length === 0) {
      throw new Error('Cannot combine empty messages array');
    }

    const texts: Array<{ content: string; timestamp: number }> = [];
    const images: Array<{ url: string; type: string; order: number; isPostImage?: boolean }> = [];

    // Sort messages by timestamp
    const sortedMessages = [...messages].sort(
      (a, b) => (a.message.createdAt?.getTime() || 0) - (b.message.createdAt?.getTime() || 0),
    );

    sortedMessages.forEach((item, index) => {
      const { message } = item;

      // Extract text content
      if (message.content?.text) {
        texts.push({
          content: message.content.text,
          timestamp: message.createdAt?.getTime() || Date.now(),
        });
      }

      // Extract image/media content
      if (message.content?.mediaUrl && message.type === 'image') {
        images.push({
          url: message.content.mediaUrl,
          type: 'image',
          order: index,
        });
      }
    });

    // Combine all text messages
    const combinedText = texts.map((t) => t.content).join('\n');

    return {
      texts: combinedText ? [{ content: combinedText, timestamp: texts[0]?.timestamp || Date.now() }] : [],
      images,
      latestMessage: {
        conversation: sortedMessages[sortedMessages.length - 1]?.conversation || messages[0]?.conversation,
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
  ): AIRequestData {
    const { texts, images } = combinedData;
    const queryText = texts[0]?.content || '';

    const requestData: AIRequestData = {
      query: queryText,
      inputs: {},
      response_mode: 'streaming',
      user: user._id,
    };

    // Add customer information to inputs if available
    if (customer) {
      requestData.inputs = {
        customer_name: customer.name || user.username,
        customer_email: customer.email,
        customer_phone: customer.phone,
      };
    }

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
