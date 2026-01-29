import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { OrganizationsModule } from '@/modules/organizations/organizations.module';
import { ConversationsModule } from '@/modules/conversations/conversations.module';

@Module({
  imports: [
    OrganizationsModule,
    ConversationsModule,
  ],
  controllers: [ExternalApiController],
})
export class ExternalApiModule {}
