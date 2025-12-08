import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FacebookAuthUrlDto {
  @IsOptional()
  @IsString()
  state?: string;
}

export class FacebookAuthorizeDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  state?: string;
}

export class FacebookCallbackDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  state: string;
}

export class FacebookPendingPagesDto {
  @IsNotEmpty()
  @IsString()
  token: string;
}

export class FacebookSavePagesDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  pageIds: string;
}

export interface FacebookTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  access_token: string;
  picture?: any;
  category?: string;
}

export interface FacebookUserInfo {
  id: string;
  name: string;
  email?: string;
  picture?: any;
}
