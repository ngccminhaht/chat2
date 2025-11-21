import { IsNumber, IsString, IsObject, IsOptional } from 'class-validator';

/**
 * Shopee webhook event DTO
 * Based on Shopee Open API webhook documentation
 */
export class ShopeeWebhookDto {
  @IsNumber()
  code: number; // 0 for success

  @IsString()
  @IsOptional()
  message?: string;

  @IsObject()
  data: ShopeeWebhookData;

  @IsNumber()
  @IsOptional()
  timestamp?: number; // Optional for verification messages

  @IsNumber()
  @IsOptional()
  shop_id?: number; // Optional for verification messages
}

/**
 * Shopee webhook data structure
 * Varies by event type (conversation, message)
 */
export interface ShopeeWebhookData {
  // Common fields
  conversation_id?: string;
  to_id?: number; // Shop ID
  to_name?: string; // Shop name

  // Message-specific fields
  message_id?: string;
  message_type?: number; // 1: text, 2: image, 3: item, etc.
  content?: string;
  from_id?: number; // Customer user ID
  from_name?: string;
  region?: string;
  status?: number; // Message status

  // Timestamp
  created_timestamp?: number;

  // Additional metadata
  [key: string]: any;
}

/**
 * Shopee message types enum
 */
export enum ShopeeMessageType {
  TEXT = 1,
  IMAGE = 2,
  ITEM = 3,
  ORDER = 4,
  STICKER = 5,
  VIDEO = 6,
  FILE = 7,
}
