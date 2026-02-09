import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Request ID middleware
  app.use((req: any, _res: any, next: any) => {
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = randomUUID();
    }
    next();
  });

  // Compression
  app.use(compression());

  const isProduction = configService.get('NODE_ENV') === 'production';

  // Security headers
  app.use(
    helmet({
      // Enable CSP in production; disable in dev for Swagger UI inline styles/scripts
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: isProduction,
    }),
  );

  // CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  if (!corsOrigin && isProduction) {
    throw new Error('CORS_ORIGIN environment variable must be set in production');
  }
  app.enableCors({
    origin: corsOrigin || 'http://localhost:3000',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger documentation (disabled in production)
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Mizano ERP API')
      .setDescription('AI-powered ERP system API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = configService.get('PORT', 3000);
  await app.listen(port);

  logger.log(`Mizano ERP API running on: http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`API Documentation: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
