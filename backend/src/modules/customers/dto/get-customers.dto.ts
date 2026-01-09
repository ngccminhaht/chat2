import { IsOptional, IsString, IsInt, Min, Max } from "class-validator";
import { Transform, Type } from "class-transformer";

export class GetCustomersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  platform?: string;

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

  @IsOptional()
  @IsString()
  sortBy?: "lastSeenAt" | "createdAt" | "totalMessages" = "lastSeenAt";

  @IsOptional()
  @Transform(({ value }) => (value === "asc" ? 1 : -1))
  sortOrder?: 1 | -1 = -1;
}
