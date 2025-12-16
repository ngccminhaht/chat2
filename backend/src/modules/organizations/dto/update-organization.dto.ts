import { IsString, IsOptional, IsObject, MinLength, MaxLength } from 'class-validator';
import { WidgetSettings, OrganizationSettings } from '@/common/database/schemas';

export class UpdateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  settings?: OrganizationSettings;

  @IsObject()
  @IsOptional()
  widgetSettings?: WidgetSettings;
}
