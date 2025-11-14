export interface ZaloWebhookDto {
  app_id: string;
  user_id_by_app: string;
  event_name: string;
  timestamp: string;
  message?: ZaloMessage;
  sender?: ZaloSender;
  recipient?: ZaloRecipient;
}

export interface ZaloMessage {
  msg_id: string;
  text?: string;
  attachments?: ZaloAttachment[];
  quote_message_id?: string;
}

export interface ZaloAttachment {
  type: 'image' | 'video' | 'file' | 'audio' | 'sticker' | 'location';
  payload: {
    url?: string;
    thumbnail?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    id?: string; // For sticker
    name?: string; // For file
    size?: number; // For file
  };
}

export interface ZaloSender {
  id: string;
}

export interface ZaloRecipient {
  id: string;
}

export interface ZaloUserInfo {
  user_id: string;
  user_id_by_app: string;
  display_name: string;
  avatar?: string;
}
