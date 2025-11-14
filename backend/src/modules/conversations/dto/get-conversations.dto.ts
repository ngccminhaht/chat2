import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetConversationsDto {
  @IsOptional()
  @IsEnum(['open', 'closed', 'archived'])
  status?: string;

  @IsOptional()
  @IsEnum(['facebook', 'zalo', 'tiktok', 'shopee'])
  platform?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
