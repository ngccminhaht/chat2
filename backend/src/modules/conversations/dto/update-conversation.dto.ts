import { IsEnum, IsOptional, IsString, IsArray } from 'class-validator';
import { ConversationStatus } from '@/common/constants';

export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsString()
  assignedTo?: string | null; // null to unassign

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
