import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Organization,
  OrganizationSchema,
  OrganizationMember,
  OrganizationMemberSchema,
} from '@/common/database/schemas';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
    forwardRef(() => UsersModule),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
