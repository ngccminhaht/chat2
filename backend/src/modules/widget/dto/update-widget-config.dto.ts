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
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class UpdateWidgetConfigDto {
  // Appearance
  @IsOptional()
  @IsIn(['circle', 'pill', 'square'])
  buttonStyle?: 'circle' | 'pill' | 'square';

  @IsOptional()
  @IsNumber()
  @Min(40)
  @Max(80)
  buttonSize?: number;

  @IsOptional()
  @IsIn(['chat', 'message', 'messenger', 'custom'])
  buttonIcon?: 'chat' | 'message' | 'messenger' | 'custom';

  @IsOptional()
  @IsUrl()
  customIconUrl?: string;

  @IsOptional()
  @IsIn(['left', 'right'])
  position?: 'left' | 'right';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  marginRight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  marginBottom?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  marginBottomMobile?: number;

  // Colors
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsIn(['light', 'dark'])
  textColor?: 'light' | 'dark';

  // Avatar
  @IsOptional()
  @IsString()
  @MaxLength(100)
  avatarName?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  // Window size
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(100)
  windowHeightMobile?: number; // Percentage (50-100%)

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(900)
  windowHeight?: number; // Pixels (200-900) or percentage (50-100)

  @IsOptional()
  @IsIn(['%', 'px'])
  windowHeightUnit?: '%' | 'px';

  // Messages
  @IsOptional()
  @IsString()
  @MaxLength(500)
  greeting?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  offlineMessage?: string;

  // Pre-chat form
  @IsOptional()
  @IsBoolean()
  preChatForm?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(['name', 'email', 'phone', 'company', 'message'], { each: true })
  preChatFields?: string[];

  // Legacy
  @IsOptional()
  @IsUrl()
  logo?: string;
}
