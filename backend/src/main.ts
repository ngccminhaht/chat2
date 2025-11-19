import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";
import { validateEnv } from "./common/env";

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // CRITICAL: Validate environment variables before starting
  try {
    const env = await validateEnv();
    logger.log(`Environment: ${env.NODE_ENV}`);
  } catch (error) {
    logger.error('Environment validation failed. Application cannot start.');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Get EnvService (will be initialized via onModuleInit)
  const envService = app.get('EnvService');

  // Enable cookie parser
  app.use(cookieParser());

  // Enable CORS with environment-based origins
  app.enableCors({
    origin: envService.corsOrigins,
    credentials: true,
  });

  logger.log(`CORS enabled for origins: ${envService.corsOrigins.join(', ')}`);

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

  await app.listen(envService.port);

  logger.log(`🚀 Application is running on: http://localhost:${envService.port}/api`);
  logger.log(`📡 WebSocket server is running on: http://localhost:${envService.port}`);
}

bootstrap();
