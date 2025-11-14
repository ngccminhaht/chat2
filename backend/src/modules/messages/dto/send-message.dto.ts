import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  conversationId: string;

  @IsNotEmpty()
  @IsEnum(['text', 'image', 'video', 'file', 'sticker', 'audio', 'location'])
  type: string;

  @IsNotEmpty()
  @IsObject()
  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    [key: string]: any;
  };
}
