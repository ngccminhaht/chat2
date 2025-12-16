import {
  IsString,
  IsOptional,
  IsEnum,
  IsUrl,
  MaxLength,
  Matches,
  IsEmail,
} from 'class-validator';
import { MessageType } from '@/common/constants';

/**
 * DTO for visitor message payload
 * Validates incoming WebSocket messages from widget
 */
export class SendVisitorMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000) // 5KB text limit
  text?: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9._\- ]+$/, {
    message: 'fileName can only contain alphanumeric characters, dots, underscores, hyphens, and spaces',
  })
  fileName?: string;
}

/**
 * DTO for pre-chat form submission
 * Validates visitor contact info before starting chat
 */
export class PreChatFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254) // RFC 5321
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-()]+$/, {
    message: 'phone must be a valid phone number format',
  })
  phone?: string;
}
