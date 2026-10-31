import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Rate limiting is keyed by client IP, and every supertest request comes from 127.0.0.1, so a
 * suite that registers a few tenants would trip the 5-per-minute auth limit. The guard itself
 * stays installed; only its counter is replaced so it never blocks.
 */
class UnlimitedThrottlerStorage implements ThrottlerStorage {
  async increment(_key: string, ttl: number): ReturnType<ThrottlerStorage['increment']> {
    return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
  }
}

/**
 * Boots the real AppModule in-process with the same global validation pipe as `src/main.ts`,
 * so request validation and response shapes match production. Requests default to English. The `/api` global prefix is not
 * applied: routes are addressed as `/bills`, `/journals`, ...
 */
export async function createTestApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue(new UnlimitedThrottlerStorage());
  const moduleFixture = await configure(builder).compile();

  const app = moduleFixture.createNestApplication();
  // The API answers in Arabic when a request names no language. Suites assert the English
  // messages, so a request without `Accept-Language` is sent as English; a test that checks
  // the Arabic answer sets the header itself (see `ApiHelper.withLanguage`).
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.headers['accept-language']) req.headers['accept-language'] = 'en';
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

/** Direct database access for ground-truth assertions (journals per source event, etc.). */
export function getPrisma(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

/** Unique, sortable token so every run creates its own tenants and documents. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
