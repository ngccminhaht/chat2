export interface FacebookWebhookDto {
  object: 'page';
  entry: FacebookEntry[];
}

export interface FacebookEntry {
  id: string; // Page ID
  time: number; // Timestamp in milliseconds
  messaging?: FacebookMessagingEvent[];
  changes?: FacebookChange[]; // For feed/comments events
}

export interface FacebookChange {
  field: 'feed' | 'comments' | string; // Event type
  value: FacebookChangeValue;
}

export interface FacebookChangeValue {
  post_id?: string; // For feed events
  comment_id?: string; // For comments
  object?: string; // 'post', 'comment'
  verb?: 'add' | 'edit' | 'remove'; // Action type
  sender_id?: string; // User who commented
  sender_name?: string;
  message?: string; // Comment text
  created_time?: number;
  [key: string]: any; // Allow other fields
}

export interface FacebookMessagingEvent {
  sender: FacebookUser;
  recipient: FacebookUser;
  timestamp: number;
  message?: FacebookMessage;
  delivery?: FacebookDelivery;
  read?: FacebookRead;
  postback?: FacebookPostback;
  referral?: FacebookReferral;
}

export interface FacebookUser {
  id: string; // User ID or Page ID
}

export interface FacebookMessage {
  mid: string; // Message ID
  text?: string;
  attachments?: FacebookAttachment[];
  quick_reply?: {
    payload: string;
  };
  sticker?: string;
  is_echo?: boolean; // True if this message was sent by the page (echo)
}

export interface FacebookAttachment {
  type: 'image' | 'video' | 'file' | 'audio' | 'location' | 'fallback';
  payload: {
    url?: string;
    sticker_id?: string;
    coordinates?: {
      lat: number;
      long: number;
    };
    title?: string;
    target?: {
      url: string;
    };
    [key: string]: any;
  };
}

export interface FacebookDelivery {
  mids?: string[]; // Message IDs
  watermark?: number; // All messages before this timestamp were delivered
}

export interface FacebookRead {
  watermark?: number; // All messages before this timestamp were read
}

export interface FacebookPostback {
  title: string;
  payload: string;
  referral?: FacebookReferral;
}

export interface FacebookReferral {
  ref?: string;
  ad_id?: string;
  ad_title?: string;
  source?: string;
  type?: string;
  referer_uri?: string;
}

// DTOs for OAuth
export class FacebookAuthUrlDto {
  state?: string;
}

export class FacebookCallbackDto {
  code: string;
  state?: string;
}

export interface FacebookTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in?: number;
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  picture?: {
    data: {
      url: string;
    };
  };
  access_token?: string;
}

export interface FacebookUserInfo {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
      is_silhouette: boolean;
    };
  };
}
