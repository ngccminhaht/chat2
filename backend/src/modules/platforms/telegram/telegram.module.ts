import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramController } from './telegram.controller';
import { TelegramConsumer } from './telegram.consumer';
import { TelegramService } from './telegram.service';
import {
  PlatformConnection,
  PlatformConnectionSchema,
} from '@/common/database/schemas/platform-connection.schema';
import { EnvModule } from '@/common/env/env.module';
import { WebhooksModule } from '@/modules/webhooks/webhooks.module';

/**
 * Telegram Module
 *
 * Handles Telegram Bot integration:
 * - HTTP: POST /api/telegram/connect (bot token connection)
 * - HTTP: POST /api/telegram/webhook/:botToken (receive updates, publish to Kafka)
 * - Kafka Consumer: uses WebhookProcessorService via PlatformCoreModule
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    EnvModule,
    WebhooksModule,
  ],
  controllers: [TelegramController, TelegramConsumer],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
