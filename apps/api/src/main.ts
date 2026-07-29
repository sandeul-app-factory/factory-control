import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { FactoryExceptionFilter } from "./common/http-exception.filter.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: (key: string, item: unknown) => unknown): void;
  };
  express.set("json replacer", (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  app.useLogger(new Logger("FactoryAPI"));
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.use(
    process.env.NODE_ENV === "production"
      ? helmet()
      : helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
            },
          },
        }),
  );
  app.enableCors({
    origin: (process.env.AUTH_ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim()),
    credentials: true,
    allowedHeaders: ["content-type", "x-csrf-token", "x-request-id", "idempotency-key"],
  });
  app.useGlobalFilters(new FactoryExceptionFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Sandeul App Factory API")
    .setDescription("Android App Factory CEO Control Plane REST API")
    .setVersion("2.0")
    .addCookieAuth(process.env.SESSION_COOKIE_NAME ?? "factory_session")
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  Logger.log(`Factory API listening on ${port}`, "Bootstrap");
}

void bootstrap();
