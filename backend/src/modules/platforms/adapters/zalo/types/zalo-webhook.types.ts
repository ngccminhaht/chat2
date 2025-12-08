/**
 * Zalo Webhook Types
 * Based on Zalo OA API
 */

export interface ZaloWebhookPayload {
  app_id: string;
  user_id_by_app?: string;
  oa_id?: string;
  event_name: ZaloEventName;
  timestamp: string;
  sender?: {
    id: string;
  };
  recipient?: {
    id: string; // OA ID
  };
  message?: ZaloMessage;
  follower?: ZaloFollower;
}

export type ZaloEventName =
  | 'user_send_text'
  | 'user_send_image'
  | 'user_send_video'
  | 'user_send_file'
  | 'user_send_audio'
  | 'user_send_sticker'
  | 'user_send_location'
  | 'user_send_gif'
  | 'user_received_message'
  | 'user_seen_message'
  | 'follow'
  | 'unfollow'
  | 'oa_send_text'
  | 'oa_send_image'
  | 'oa_send_file';

export interface ZaloMessage {
  msg_id: string;
  text?: string;
  attachments?: ZaloAttachment[];
  url?: string; // For media messages
  thumb?: string;
  description?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  sticker_id?: string;
}

export interface ZaloAttachment {
  type: 'image' | 'file' | 'video' | 'audio' | 'gif' | 'sticker' | 'link';
  payload?: {
    thumbnail?: string;
    url?: string;
    name?: string;
    size?: number;
  };
}

export interface ZaloFollower {
  id: string;
  name?: string;
  avatar?: string;
}

/**
 * Zalo API Response Types
 */
export interface ZaloTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  error?: number;
  message?: string;
}

export interface ZaloOAInfo {
  oaId: string;
  name: string;
  description?: string;
  avatar?: string;
  cover?: string;
  isVerified?: boolean;
  oaType?: number;
  cateName?: string;
  numFollower?: number;
}

export interface ZaloUserProfile {
  user_id: string;
  user_id_by_app: string;
  display_name: string;
  avatar?: string;
  user_is_follower?: boolean;
  error?: number;
  message?: string;
}

export interface ZaloSendResponse {
  error: number;
  message: string;
  data?: {
    message_id: string;
  };
}
