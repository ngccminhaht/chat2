/**
 * Facebook Webhook Types
 * Based on Facebook Messenger Platform API
 */

export interface FacebookWebhookPayload {
  object: 'page' | string;
  entry: FacebookEntry[];
}

export interface FacebookEntry {
  id: string; // Page ID
  time: number;
  messaging?: FacebookMessagingEvent[];
  changes?: FacebookChange[];
}

export interface FacebookMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: FacebookMessage;
  delivery?: FacebookDelivery;
  read?: FacebookRead;
  postback?: FacebookPostback;
}

export interface FacebookMessage {
  mid: string;
  text?: string;
  is_echo?: boolean;
  attachments?: FacebookAttachment[];
  quick_reply?: {
    payload: string;
  };
  reply_to?: {
    mid: string;
  };
}

export interface FacebookAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'location' | 'fallback' | 'template';
  payload?: {
    url?: string;
    title?: string;
    coordinates?: {
      lat: number;
      long: number;
    };
    sticker_id?: number;
  };
}

export interface FacebookDelivery {
  mids: string[];
  watermark: number;
}

export interface FacebookRead {
  watermark: number;
}

export interface FacebookPostback {
  title: string;
  payload: string;
  referral?: {
    ref: string;
    source: string;
    type: string;
  };
}

export interface FacebookChange {
  field: 'feed' | 'comments' | string;
  value: FacebookChangeValue;
}

export interface FacebookChangeValue {
  item: string;
  verb: 'add' | 'edit' | 'remove' | string;
  sender_id?: string;
  sender_name?: string;
  post_id?: string;
  comment_id?: string;
  message?: string;
  created_time?: number;
  parent_id?: string;
}

/**
 * Facebook API Response Types
 */
export interface FacebookTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  access_token?: string;
  category?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

export interface FacebookUserInfo {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

export interface FacebookSenderProfile {
  id: string;
  name: string;
  profile_pic?: string;
}

export interface FacebookSendResponse {
  recipient_id: string;
  message_id: string;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}
