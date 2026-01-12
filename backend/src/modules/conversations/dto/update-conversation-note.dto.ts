import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
} from "class-validator";

export class UpdateConversationNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
