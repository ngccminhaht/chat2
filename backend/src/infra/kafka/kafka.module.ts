import { Module, Global } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';

/**
 * Global Kafka Module
 *
 * Pure infrastructure module providing only Kafka producer.
 * Consumers are registered in ConsumersModule to avoid circular dependencies.
 *
 * This module:
 * - ✅ Provides Kafka producer service globally
 * - ✅ Contains Kafka configuration and topics
 * - ❌ Does NOT import application modules
 * - ❌ Does NOT contain consumers (moved to ConsumersModule)
 */
@Global()
@Module({
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
