import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ZaloAuthUrlDto {
  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsNotEmpty()
  @IsString()
  organizationId: string;
}

export class ZaloAuthorizeDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsString()
  organizationId: string;

  @IsOptional()
  @IsString()
  state?: string;
}

export class ZaloCallbackDto {
  @IsString()
  code: string;

  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  oa_id?: string;

  @IsOptional()
  @IsString()
  code_verifier?: string;
}

export interface ZaloTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface ZaloOAInfo {
  oa_id: string;
  name: string;
  description?: string;
  avatar?: string;
  cover?: string;
  num_follower?: number;
}
