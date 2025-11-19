import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * DTO for Shopee authorization URL generation
 */
export class ShopeeAuthUrlDto {
  @IsString()
  @IsOptional()
  state?: string;
}

/**
 * DTO for Shopee OAuth callback
 */
export class ShopeeCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  shop_id: string;

  @IsString()
  @IsOptional()
  state?: string;
}

/**
 * Shopee token response interface
 */
export interface ShopeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number; // Shopee uses expire_in (not expires_in)
  shop_id: number;
}

/**
 * Shopee shop information
 */
export interface ShopeeShopInfo {
  shop_id: number;
  shop_name: string;
  region: string;
  status: string;
  logo?: string;
}

/**
 * Shopee refresh token response
 */
export interface ShopeeRefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  shop_id: number;
}
