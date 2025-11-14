import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ZaloAuthUrlDto {
  @IsString()
  @IsOptional()
  state?: string;
}

export class ZaloCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  code_verifier: string;

  @IsString()
  @IsOptional()
  state?: string;
}

export interface ZaloTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface ZaloOAInfo {
  oa_id: string;
  name: string;
  description: string;
  avatar: string;
}
