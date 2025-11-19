import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";
import { EnvService } from "./common/env";

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Environment validation happens automatically in EnvService constructor
  const app = await NestFactory.create(AppModule);

  // Get EnvService (already initialized with validated config)
  const envService = app.get(EnvService);
  logger.log(`Environment: ${envService.nodeEnv}`);

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
