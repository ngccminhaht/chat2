import { IsString, IsEmail, IsEnum } from 'class-validator';
import { OrganizationRole } from '@/common/database/schemas';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
