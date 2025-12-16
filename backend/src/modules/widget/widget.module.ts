import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';
import {
  Organization,
  OrganizationSchema,
} from '@/common/database/schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [WidgetController],
  providers: [WidgetService],
  exports: [WidgetService],
})
export class WidgetModule {}
