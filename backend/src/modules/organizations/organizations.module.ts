import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Organization,
  OrganizationSchema,
  OrganizationMember,
  OrganizationMemberSchema,
  PlatformConnection,
  PlatformConnectionSchema,
} from '@/common/database/schemas';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { UsersModule } from '../users/users.module';
import { WidgetModule } from '../widget/widget.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    forwardRef(() => UsersModule),
    WidgetModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
