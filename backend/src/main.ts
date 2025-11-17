import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('HTTP');

  // Enable cookie parser
  app.use(cookieParser());

  // Global request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const { method, originalUrl, ip, headers } = req;
    const userAgent = headers['user-agent'] || 'unknown';
    const startTime = Date.now();

    // Log incoming request
    logger.log(`📨 ${method} ${originalUrl} - IP: ${ip} - UA: ${userAgent.substring(0, 50)}`);

    // Log request body for webhooks and POST requests
    if (originalUrl.includes('/webhook') || method === 'POST') {
      logger.log(`Request Body: ${JSON.stringify(req.body, null, 2).substring(0, 500)}`);
    }

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      const logLevel = statusCode >= 400 ? 'error' : 'log';
      logger[logLevel](`✅ ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    });

    next();
  });

  // Enable CORS
  app.enableCors({
    origin: [
      "https://miagent.sapp.merket.io",
      "http://localhost:3001",
      "http://localhost:8315",
    ],
    credentials: true,
  });

  app
    .getHttpAdapter()
    .getInstance()
    .get(
      "/zalo_verifierHl-69CBzBm8yWwbLvh8cLG2VfNFiwN4jCZ0s.html",
      (_, res: Response) => {
        res.send(`
<!DOCTYPE html>
<html lang="en">

<head>
    <meta property="zalo-platform-site-verification" content="Hl-69CBzBm8yWwbLvh8cLG2VfNFiwN4jCZ0s" />
</head>

<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>

</html>`);
      }
    );

  app
    .getHttpAdapter()
    .getInstance()
    .get(
      "/webhook/zalo_verifierHl-69CBzBm8yWwbLvh8cLG2VfNFiwN4jCZ0s.html",
      (_, res: Response) => {
        res.send(`
<!DOCTYPE html>
<html lang="en">

<head>
    <meta property="zalo-platform-site-verification" content="Hl-69CBzBm8yWwbLvh8cLG2VfNFiwN4jCZ0s" />
</head>

<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>

</html>`);
      }
    );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  // Global prefix
  app.setGlobalPrefix("api");

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
}

bootstrap();
