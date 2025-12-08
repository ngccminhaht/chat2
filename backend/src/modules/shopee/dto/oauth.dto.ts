import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ShopeeAuthUrlDto {
  @IsOptional()
  @IsString()
  state?: string;
}

export class ShopeeAuthorizeDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  state?: string;
}

export class ShopeeCallbackDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  state: string;

  @IsNotEmpty()
  @IsString()
  shop_id: string;
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
