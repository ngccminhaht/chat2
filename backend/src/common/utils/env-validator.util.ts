/**
 * Environment Variable Validator
 * Ensures critical env vars are set with proper validation
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('EnvValidator');

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = {
  // Database
  MONGODB_URI: 'MongoDB connection string',

  // JWT Secrets
  JWT_SECRET: 'JWT access token secret (use: openssl rand -base64 32)',
  JWT_REFRESH_SECRET: 'JWT refresh token secret (use: openssl rand -base64 32)',

  // Kafka
  KAFKA_BROKERS: 'Kafka broker addresses (comma-separated)',

  // Redis
  REDIS_HOST: 'Redis host',
  REDIS_PORT: 'Redis port',
} as const;

/**
 * Platform-specific optional env vars (warn if missing)
 */
const PLATFORM_ENV_VARS = {
  // Facebook
  FACEBOOK_APP_ID: 'Facebook App ID',
  FACEBOOK_APP_SECRET: 'Facebook App Secret',
  FACEBOOK_REDIRECT_URI: 'Facebook OAuth redirect URI',

  // Zalo
  ZALO_APP_ID: 'Zalo App ID',
  ZALO_APP_SECRET: 'Zalo App Secret',
  ZALO_REDIRECT_URI: 'Zalo OAuth redirect URI',

  // Shopee
  SHOPEE_PARTNER_ID: 'Shopee Partner ID',
  SHOPEE_PARTNER_KEY: 'Shopee Partner Key',
  SHOPEE_REDIRECT_URI: 'Shopee OAuth redirect URI',

  // TikTok
  TIKTOK_APP_ID: 'TikTok App ID',
  TIKTOK_APP_SECRET: 'TikTok App Secret',
  TIKTOK_REDIRECT_URI: 'TikTok OAuth redirect URI',
} as const;

/**
 * Dangerous default values that should NEVER be used in production
 */
const DANGEROUS_DEFAULTS = [
  'default-secret',
  'change-me',
  'secret',
  'password',
  '123456',
];

/**
 * Validate environment variables on application startup
 */
export function validateEnvironment(): void {
  logger.log('🔍 Validating environment variables...');

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
    const value = process.env[key];

    if (!value) {
      errors.push(`❌ Missing required env var: ${key} (${description})`);
    } else if (DANGEROUS_DEFAULTS.includes(value.toLowerCase())) {
      errors.push(
        `❌ SECURITY RISK: ${key} is set to a dangerous default value. ` +
          `Please generate a secure secret.`,
      );
    } else if (key.includes('SECRET') && value.length < 32) {
      warnings.push(
        `⚠️  ${key} should be at least 32 characters for security`,
      );
    }
  }

  // Check platform variables (warnings only)
  for (const [key, description] of Object.entries(PLATFORM_ENV_VARS)) {
    const value = process.env[key];

    if (!value) {
      warnings.push(`⚠️  Optional env var not set: ${key} (${description})`);
    }
  }

  // Report results
  if (errors.length > 0) {
    logger.error('\n' + '='.repeat(80));
    logger.error('ENVIRONMENT VALIDATION FAILED');
    logger.error('='.repeat(80));
    errors.forEach((err) => logger.error(err));
    logger.error('='.repeat(80));
    logger.error(
      'Application cannot start with missing required environment variables.',
    );
    logger.error('Please check your .env file and ensure all values are set.');
    logger.error('='.repeat(80) + '\n');

    throw new Error('Environment validation failed. See logs above.');
  }

  if (warnings.length > 0) {
    logger.warn('\n' + '-'.repeat(80));
    logger.warn('ENVIRONMENT WARNINGS');
    logger.warn('-'.repeat(80));
    warnings.forEach((warn) => logger.warn(warn));
    logger.warn('-'.repeat(80) + '\n');
  }

  logger.log('✅ Environment validation passed');
}

/**
 * Get required env var with runtime validation
 */
export function getRequiredEnv(key: string, description?: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}` +
        (description ? ` (${description})` : ''),
    );
  }

  if (DANGEROUS_DEFAULTS.includes(value.toLowerCase())) {
    throw new Error(
      `SECURITY RISK: ${key} is set to a dangerous default value. ` +
        `Please generate a secure secret.`,
    );
  }

  return value;
}

/**
 * Get optional env var with default
 */
export function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get numeric env var with validation
 */
export function getNumericEnv(
  key: string,
  defaultValue: number,
): number {
  const value = process.env[key];

  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    logger.warn(
      `Invalid numeric value for ${key}: "${value}". Using default: ${defaultValue}`,
    );
    return defaultValue;
  }

  return parsed;
}

/**
 * Get boolean env var
 */
export function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase();

  if (!value) {
    return defaultValue;
  }

  return value === 'true' || value === '1' || value === 'yes';
}
