import {
  IsBoolean,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdateAIAgentDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  endpoint?: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(30000)
  batchDelayMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxImages?: number;
}
