import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { OrganizationsModule } from '@/modules/organizations/organizations.module';
import { ConnectionsModule } from '@/modules/connections/connections.module';
import { ConversationsModule } from '@/modules/conversations/conversations.module';

@Module({
  imports: [
    OrganizationsModule,
    ConnectionsModule,
    ConversationsModule,
  ],
  controllers: [ExternalApiController],
})
export class ExternalApiModule {}
