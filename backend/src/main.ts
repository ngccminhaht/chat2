import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { Request, Response } from "express";
import cookieParser from "cookie-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parser
  app.use(cookieParser());

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

  app
    .getHttpAdapter()
    .getInstance()
    .post("/webhook/zalo", (_, res: Response) => {
      res.json({ success: true });
    });

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
