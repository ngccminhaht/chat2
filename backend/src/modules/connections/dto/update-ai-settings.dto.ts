import {
  IsBoolean,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsUrl,
} from 'class-validator';

export class UpdateAISettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsUrl()
  @IsOptional()
  endpoint?: string;

  @IsNumber()
  @IsOptional()
  @Min(1000)
  @Max(30000)
  batchDelayMs?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(10)
  maxImages?: number;

  // [DEPRECATED] Not used anymore - kept for backward compatibility
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(604800) // Max 7 days
  autoUnseenTimeoutSeconds?: number;
}
