import { IsNotEmpty, IsString } from 'class-validator';

export class MarkReadDto {
  @IsNotEmpty()
  @IsString()
  conversationId: string;
}
