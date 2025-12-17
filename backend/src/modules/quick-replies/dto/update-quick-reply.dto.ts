import { IsString, IsOptional, IsArray, IsBoolean, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^\/[a-z0-9_-]+$/, { message: 'Shortcut must start with / and contain only lowercase letters, numbers, underscores, and hyphens' })
  shortcut?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
