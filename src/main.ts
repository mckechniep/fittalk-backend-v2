// src/main.ts
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import { AppModule } from './app.module';

async function bootstrap() {
  // Create Fastify application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
    }),
  );

  // Get config service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  const corsOrigins = configService.get<string[]>('app.corsOrigin');

  // Security middleware
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        scriptSrc: [`'self'`, `'unsafe-inline'`, `'unsafe-eval'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        fontSrc: [`'self'`, 'fonts.gstatic.com', 'data:'],
      },
    },
  });

  // CORS
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

  // Compression
  await app.register(compress);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'auth/health'],
  });

  // Start server
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
}

bootstrap();