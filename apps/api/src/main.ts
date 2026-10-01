import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { resolveLogLevels } from './modules/logger/log-level';

async function bootstrap() {
  // Buffer startup logs until LOG_LEVEL (from the env file loaded by ConfigModule) is applied
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  app.useLogger(
    resolveLogLevels(configService.get<string>('LOG_LEVEL'), configService.get<string>('NODE_ENV')),
  );
  const logger = new Logger('Bootstrap');

  // Assign a unique request ID to each incoming request for tracing
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = randomUUID();
    }
    next();
  });

  // Enable gzip/brotli response compression to reduce payload sizes
  app.use(compression());

  const isProduction = configService.get('NODE_ENV') === 'production';

  // Set security headers (CSP, CORP, etc.) via helmet; CSP disabled in dev for Swagger
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

  // Configure CORS; supports comma-separated origins (e.g. "http://ip:5001,http://domain.com")
  const corsOriginRaw = configService.get<string>('CORS_ORIGIN');
  if (!corsOriginRaw && isProduction) {
    throw new Error('CORS_ORIGIN environment variable must be set in production');
  }
  const corsOrigins = corsOriginRaw
    ? corsOriginRaw.split(',').map((o) => o.trim())
    : ['http://localhost:5001'];
  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });

  // Strip unknown properties, auto-transform types, reject unexpected fields
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

  // All routes prefixed with /api (e.g., /api/invoices, /api/auth/login)
  app.setGlobalPrefix('api');

  // Swagger/OpenAPI docs at /api/docs (disabled in production for security)
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

  // Listen for SIGTERM/SIGINT to close connections cleanly before exit
  app.enableShutdownHooks();

  const port = configService.get('API_PORT') || configService.get('PORT', 6001);
  await app.listen(port);

  logger.log(`Mizano ERP API running on: http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`API Documentation: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
