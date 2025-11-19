/**
 * Environment Schema Validation
 * Uses class-validator for NestJS-native validation
 */

import {
  IsString,
  IsNumber,
  IsEnum,
  IsUrl,
  IsOptional,
  MinLength,
  Min,
  validate,
  validateSync,
  ValidateIf,
} from 'class-validator';
import { Transform, plainToClass } from 'class-transformer';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Custom validator to check for dangerous defaults
 */
function IsSecureSecret() {
  return function (object: Object, propertyName: string) {
    const dangerousDefaults = [
      'default-secret',
      'change-me',
      'secret',
      'password',
      '123456',
    ];

    ValidateIf((o) => {
      const value = o[propertyName];
      if (!value) return true;
      return !dangerousDefaults.includes(value.toLowerCase());
    });
  };
}

export class EnvironmentVariables {
  // ============================================================================
  // Server Configuration
  // ============================================================================

  @IsEnum(NodeEnv)
  @Transform(({ value }) => value || 'development')
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @Min(1)
  @Transform(({ value }) => (value ? parseInt(value, 10) : 3000))
  PORT: number = 3000;

  @IsString()
  @Transform(({ value }) => value || 'http://localhost:3001')
  CORS_ORIGINS: string = 'http://localhost:3001';

  // ============================================================================
  // Database
  // ============================================================================

  @IsString()
  MONGODB_URI!: string;

  // ============================================================================
  // JWT Configuration
  // ============================================================================

  @IsString()
  @MinLength(32, {
    message: 'JWT_SECRET must be at least 32 characters (use: openssl rand -base64 32)',
  })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters (use: openssl rand -base64 32)',
  })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @Transform(({ value }) => value || '15m')
  JWT_EXPIRES_IN: string = '15m';

  @IsString()
  @Transform(({ value }) => value || '7d')
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  // ============================================================================
  // Encryption
  // ============================================================================

  @IsString()
  @MinLength(32, {
    message: 'ENCRYPTION_KEY must be at least 32 characters (use: openssl rand -base64 32)',
  })
  ENCRYPTION_KEY!: string;

  // ============================================================================
  // Kafka Configuration
  // ============================================================================

  @IsString()
  KAFKA_BROKERS!: string;

  @IsString()
  @Transform(({ value }) => value || 'miagent')
  KAFKA_CLIENT_ID: string = 'miagent';

  @IsString()
  @Transform(({ value }) => value || 'miagent-group')
  KAFKA_GROUP_ID: string = 'miagent-group';

  // ============================================================================
  // Redis Configuration
  // ============================================================================

  @IsString()
  REDIS_HOST!: string;

  @IsNumber()
  @Min(1)
  @Transform(({ value }) => (value ? parseInt(value, 10) : 6379))
  REDIS_PORT: number = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  // ============================================================================
  // Facebook Platform (Optional)
  // ============================================================================

  @IsOptional()
  @IsString()
  FACEBOOK_APP_ID?: string;

  @IsOptional()
  @IsString()
  FACEBOOK_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  FACEBOOK_REDIRECT_URI?: string;

  @IsOptional()
  @IsString()
  FACEBOOK_WEBHOOK_SECRET?: string;

  // ============================================================================
  // Zalo Platform (Optional)
  // ============================================================================

  @IsOptional()
  @IsString()
  ZALO_APP_ID?: string;

  @IsOptional()
  @IsString()
  ZALO_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  ZALO_REDIRECT_URI?: string;

  @IsString()
  @Transform(({ value }) => value || 'Hl-69CBzBm8yWwbLvh8cLG2VfNFiwN4jCZ0s')
  ZALO_VERIFICATION_TOKEN: string = 'Hl-69CBzBm8yWwbLvh8cLG2VfNFiwN4jCZ0s';

  // ============================================================================
  // Shopee Platform (Optional)
  // ============================================================================

  @IsOptional()
  @IsString()
  SHOPEE_PARTNER_ID?: string;

  @IsOptional()
  @IsString()
  SHOPEE_PARTNER_KEY?: string;

  @IsOptional()
  @IsString()
  SHOPEE_REDIRECT_URI?: string;

  // ============================================================================
  // TikTok Platform (Optional)
  // ============================================================================

  @IsOptional()
  @IsString()
  TIKTOK_APP_ID?: string;

  @IsOptional()
  @IsString()
  TIKTOK_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  TIKTOK_REDIRECT_URI?: string;

  // ============================================================================
  // Feature Flags
  // ============================================================================

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  ENABLE_WEBHOOK_LOGGING?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  ENABLE_DEBUG_LOGGING?: boolean;
}

/**
 * Validate environment variables synchronously
 * Used by EnvService during construction
 */
export function validateEnvSync(): EnvironmentVariables {
  const validatedConfig = plainToClass(EnvironmentVariables, process.env, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ ENVIRONMENT VALIDATION FAILED');
    console.error('='.repeat(80));

    errors.forEach((error) => {
      console.error(`\n${error.property}:`);
      if (error.constraints) {
        Object.values(error.constraints).forEach((message) => {
          console.error(`  ❌ ${message}`);
        });
      }
    });

    console.error('\n' + '='.repeat(80));
    console.error('Please check your .env file and fix the errors above.');
    console.error('Generate secrets with: openssl rand -base64 32');
    console.error('='.repeat(80) + '\n');

    throw new Error('Environment validation failed');
  }

  console.log('✅ Environment validation passed');
  return validatedConfig;
}

/**
 * Validate environment variables using class-validator (async version)
 * @deprecated Use validateEnvSync() instead for synchronous validation
 */
export async function validateEnv(): Promise<EnvironmentVariables> {
  const validatedConfig = plainToClass(EnvironmentVariables, process.env, {
    enableImplicitConversion: false,
  });

  const errors = await validate(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ ENVIRONMENT VALIDATION FAILED');
    console.error('='.repeat(80));

    errors.forEach((error) => {
      console.error(`\n${error.property}:`);
      if (error.constraints) {
        Object.values(error.constraints).forEach((message) => {
          console.error(`  ❌ ${message}`);
        });
      }
    });

    console.error('\n' + '='.repeat(80));
    console.error('Please check your .env file and fix the errors above.');
    console.error('Generate secrets with: openssl rand -base64 32');
    console.error('='.repeat(80) + '\n');

    throw new Error('Environment validation failed');
  }

  console.log('✅ Environment validation passed');
  return validatedConfig;
}
