import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebsocketGateway } from './websocket.gateway';
import { VisitorGateway } from './visitor.gateway';
import { VisitorMessageService } from './visitor-message.service';
import { VisitorRateLimitService } from './visitor-rate-limit.service';
import { WebSocketBridgeConsumer } from './websocket-bridge.consumer';
import {
  Organization,
  OrganizationSchema,
} from '@/common/database/schemas/organization.schema';
import {
  Conversation,
  ConversationSchema,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageSchema,
} from '@/common/database/schemas/message.schema';
import { CustomersModule } from '@/modules/customers/customers.module';
import { AuthModule } from '@/modules/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    // Note: InboundMessageHandlerModule is @Global, no need to import here
    CustomersModule,
  ],
  controllers: [WebSocketBridgeConsumer],
  providers: [
    WebsocketGateway,
    VisitorGateway,
    VisitorMessageService,
    VisitorRateLimitService,
  ],
  exports: [
    WebsocketGateway,
    VisitorGateway,
    VisitorMessageService,
  ],
})
export class WebsocketModule {}
