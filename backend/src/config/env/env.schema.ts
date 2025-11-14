import { Type } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsNumber, IsString, IsOptional, IsUrl } from 'class-validator'

export enum Environment {
  development = 'development',
  staging = 'staging',
  production = 'production',
}

export class EnvSchema {
  // Application
  @IsEnum(Environment)
  NODE_ENV: Environment

  @Type(() => Number)
  @IsNumber()
  PORT: number

  // MongoDB
  @IsString()
  @IsNotEmpty()
  MONGODB_URI: string

  // Kafka
  @IsString()
  @IsNotEmpty()
  KAFKA_BROKERS: string

  @IsString()
  @IsNotEmpty()
  KAFKA_CLIENT_ID: string

  // Redis
  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string

  @Type(() => Number)
  @IsNumber()
  REDIS_PORT: number

  @IsString()
  @IsOptional()
  REDIS_PASSWORD: string

  // JWT
  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN: string

  // Facebook
  @IsString()
  @IsOptional()
  FB_APP_ID: string

  @IsString()
  @IsOptional()
  FB_APP_SECRET: string

  @IsString()
  @IsOptional()
  FB_VERIFY_TOKEN: string

  @IsUrl()
  @IsOptional()
  FB_REDIRECT_URI: string

  // Zalo
  @IsString()
  @IsOptional()
  ZALO_APP_ID: string

  @IsString()
  @IsOptional()
  ZALO_APP_SECRET: string

  @IsUrl()
  @IsOptional()
  ZALO_REDIRECT_URI: string

  // TikTok Shop
  @IsString()
  @IsOptional()
  TIKTOK_APP_KEY: string

  @IsString()
  @IsOptional()
  TIKTOK_APP_SECRET: string

  @IsUrl()
  @IsOptional()
  TIKTOK_REDIRECT_URI: string

  // WebSocket
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  WS_PORT: number

  @IsString()
  @IsOptional()
  WS_CORS_ORIGIN: string

  // Frontend URL
  @IsUrl()
  @IsNotEmpty()
  FRONTEND_URL: string
}
