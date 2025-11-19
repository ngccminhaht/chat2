import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class EnvSchema {
  // Application
  @IsString()
  NODE_ENV: string = 'development';

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  PORT: number = 3000;

  @IsString()
  FRONTEND_URL: string = 'http://localhost:3001';

  @IsArray()
  @Transform(({ value }) => value ? value.split(',').map((v: string) => v.trim()) : ['http://localhost:3001'])
  CORS_ORIGINS: string[];

  // Database
  @IsString()
  MONGODB_URI: string = 'mongodb://localhost:27017/miagent';

  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  REDIS_PORT: number = 6379;

  // JWT
  @IsString()
  JWT_SECRET: string = 'your-secret-key';

  @IsString()
  JWT_REFRESH_SECRET: string = 'your-refresh-secret-key';

  // Kafka
  @IsString()
  KAFKA_BROKER: string = 'localhost:9092';

  // Zalo
  @IsString()
  @IsOptional()
  ZALO_APP_ID?: string;

  @IsString()
  @IsOptional()
  ZALO_APP_SECRET?: string;

  // Facebook
  @IsString()
  @IsOptional()
  FACEBOOK_APP_ID?: string;

  @IsString()
  @IsOptional()
  FACEBOOK_APP_SECRET?: string;

  @IsString()
  @IsOptional()
  FACEBOOK_VERIFY_TOKEN?: string;

  // Shopee
  @IsString()
  @IsOptional()
  SHOPEE_PARTNER_ID?: string;

  @IsString()
  @IsOptional()
  SHOPEE_PARTNER_KEY?: string;

  // TikTok
  @IsString()
  @IsOptional()
  TIKTOK_APP_ID?: string;

  @IsString()
  @IsOptional()
  TIKTOK_APP_SECRET?: string;
}
