import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class FacebookAuthUrlDto {
  @IsString()
  @IsOptional()
  state?: string;
}

export class FacebookCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  state?: string;
}

export interface FacebookTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in?: number;
}

export interface FacebookLongLivedTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  picture?: {
    data: {
      url: string;
    };
  };
  access_token?: string;
  category?: string;
}

export interface FacebookPageList {
  data: FacebookPageInfo[];
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
}

export interface FacebookUserInfo {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
      is_silhouette: boolean;
    };
  };
}

export interface FacebookErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}
