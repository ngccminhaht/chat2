/**
 * Kafka Consumers Module
 * Registers global Kafka consumers that are not platform-specific
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Message,
  MessageSchema,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionSchema,
} from '@/common/database/schemas/platform-connection.schema';
import { MessageSenderConsumer } from './message-sender.consumer';

/**
 * Consumers Module
 *
 * Contains global Kafka consumers:
 * - MessageSenderConsumer: Processes outgoing messages for all platforms
 *
 * Platform-specific consumers are in their respective modules:
 * - FacebookConsumer in FacebookModule
 * - ZaloConsumer in ZaloModule
 * - ShopeeConsumer in ShopeeModule
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
  ],
  controllers: [MessageSenderConsumer],
})
export class ConsumersModule {}
