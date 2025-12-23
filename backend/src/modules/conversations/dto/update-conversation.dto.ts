import {
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ConversationStatus } from '@/common/constants';

export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;
}
