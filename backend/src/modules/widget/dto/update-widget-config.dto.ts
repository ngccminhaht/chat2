import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsHexColor,
  IsUrl,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class UpdateWidgetConfigDto {
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsIn(['left', 'right'])
  position?: 'left' | 'right';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  greeting?: string;

  @IsOptional()
  @IsUrl()
  logo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  offlineMessage?: string;

  @IsOptional()
  @IsBoolean()
  preChatForm?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(['name', 'email', 'phone', 'company', 'message'], { each: true })
  preChatFields?: string[];
}
