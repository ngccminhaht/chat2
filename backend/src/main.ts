import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";
import { EnvService } from "./common/env";
import { getKafkaConfig } from "./common/kafka/kafka.config";

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Environment validation happens automatically in EnvService constructor
  const app = await NestFactory.create(AppModule);

  // Get EnvService (already initialized with validated config)
  const envService = app.get(EnvService);
  logger.log(`Environment: ${envService.get('NODE_ENV')}`);

  // Connect Kafka microservice for @MessagePattern decorators
  const kafkaConfig = getKafkaConfig(envService);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: kafkaConfig,
      consumer: {
        groupId: 'omnichat-backend-consumers',
      },
    },
  });

  logger.log(`📨 Kafka microservice configured with brokers: ${kafkaConfig.brokers.join(', ')}`);

  // Enable cookie parser
  app.use(cookieParser());

  // Enable CORS with environment-based origins
  app.enableCors({
    origin: envService.get('CORS_ORIGINS'),
    credentials: true,
  });

  logger.log(`CORS enabled for origins: ${envService.get('CORS_ORIGINS').join(', ')}`);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false, // Allow extra fields (important for webhooks with dynamic schemas)
      transform: true,
      forbidNonWhitelisted: false,
    })
  );

  // Global prefix
  app.setGlobalPrefix("api");

  // Start all microservices (Kafka consumers)
  await app.startAllMicroservices();
  logger.log('✅ Kafka consumers started');

  await app.listen(envService.get('PORT'));

  logger.log(`🚀 Application is running on: http://localhost:${envService.get('PORT')}/api`);
  logger.log(`📡 WebSocket server is running on: http://localhost:${envService.get('PORT')}`);
}

bootstrap();
