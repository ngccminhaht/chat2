import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { WebsocketGateway } from './websocket.gateway';
import { VisitorGateway } from './visitor.gateway';
import { VisitorMessageService } from './visitor-message.service';
import { VisitorRateLimitService } from './visitor-rate-limit.service';
import { WebSocketBridgeConsumer } from './websocket-bridge.consumer';
import { EnvService } from '@/common/env';
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
import { AIBatchingModule } from '@/modules/ai-batching/ai-batching.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [EnvService],
      useFactory: (envService: EnvService) => ({
        secret: envService.get('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AIBatchingModule,
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
