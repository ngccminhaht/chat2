/**
 * Shopee Webhook Types
 * Based on Shopee Open Platform API
 */

export interface ShopeeWebhookPayload {
  shop_id: number;
  code: number;
  timestamp: number;
  data?: ShopeeMessageData | ShopeeOrderData;
}

export interface ShopeeMessageData {
  conversation_id: string;
  message_type: ShopeeMessageType;
  content?: ShopeeMessageContent;
  from_id: number;
  from_user_name?: string;
  to_id: number;
  message_id: string;
  source_content?: ShopeeSourceContent;
  created_timestamp: number;
}

export type ShopeeMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'sticker'
  | 'item'
  | 'order'
  | 'file';

export interface ShopeeMessageContent {
  text?: string;
  url?: string;
  file_server_id?: string;
  file_name?: string;
  sticker_id?: string;
  sticker_package_id?: string;
  item_id?: number;
  order_sn?: string;
  shop_id?: number;
}

export interface ShopeeSourceContent {
  item?: {
    item_id: number;
    name?: string;
    image_url?: string;
    price?: number;
  };
  order?: {
    order_sn: string;
    items?: Array<{
      item_id: number;
      name?: string;
    }>;
  };
}

export interface ShopeeOrderData {
  order_sn: string;
  order_status: string;
}

/**
 * Shopee API Response Types
 */
export interface ShopeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  error?: string;
  message?: string;
  request_id?: string;
}

export interface ShopeeShopInfo {
  shop_id: number;
  shop_name: string;
  region: string;
  status: string;
  is_sip?: boolean;
  is_cb?: boolean;
}

export interface ShopeeSendResponse {
  request_id?: string;
  error?: string;
  message?: string;
  response?: {
    to_id: number;
    message_id: string;
  };
}

export interface ShopeeConversation {
  conversation_id: string;
  to_id: number;
  to_name?: string;
  to_avatar?: string;
  shop_id: number;
  unread_count: number;
  pinned: boolean;
  last_message_id?: string;
  last_message_timestamp?: number;
  last_message_content?: ShopeeMessageContent;
  last_message_type?: ShopeeMessageType;
}
