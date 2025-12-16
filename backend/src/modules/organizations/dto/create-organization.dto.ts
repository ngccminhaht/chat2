import { IsString, IsOptional, IsObject, MinLength, MaxLength, Matches } from 'class-validator';
import { WidgetSettings, OrganizationSettings } from '@/common/database/schemas';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsObject()
  @IsOptional()
  settings?: OrganizationSettings;

  @IsObject()
  @IsOptional()
  widgetSettings?: WidgetSettings;
}
