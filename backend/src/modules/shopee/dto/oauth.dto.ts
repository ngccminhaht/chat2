import { IsOptional, IsString } from 'class-validator';

export class ShopeeAuthUrlDto {
  @IsOptional()
  @IsString()
  state?: string;
}

export class ShopeeCallbackDto {
  @IsString()
  code: string;

  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  shop_id?: string;
}

export interface ShopeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  shop_id?: number;
}

export interface ShopeeShopInfo {
  shop_id: number;
  shop_name: string;
  region?: string;
  status?: string;
  logo?: string;
}

export interface ShopeeRefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  shop_id?: number;
}
