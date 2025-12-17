import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AiProvider, AiAgentStatus } from '../ai-agent.schema';

class AiAgentSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(4000)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5000)
  responseDelay?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  handoffKeywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  greetingMessage?: string;
}

export class UpdateAiAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsEnum(AiProvider)
  provider?: AiProvider;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  systemPrompt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeBase?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AiAgentSettingsDto)
  settings?: AiAgentSettingsDto;

  @IsOptional()
  @IsEnum(AiAgentStatus)
  status?: AiAgentStatus;
}
