import { IsOptional, IsString } from 'class-validator';

export class FacebookAuthUrlDto {
  @IsOptional()
  @IsString()
  state?: string;
}

export class FacebookCallbackDto {
  @IsString()
  code: string;

  @IsString()
  state: string;
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
