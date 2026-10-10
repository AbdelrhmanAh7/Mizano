import { INestApplication, ModuleMetadata, ValidationPipe } from '@nestjs/common';
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
 * so request validation and response shapes match production. The `/api` global prefix is not
 * applied: routes are addressed as `/bills`, `/journals`, ...
 * `extraImports` boots more modules into the same Nest app (e.g. the intake worker module).
 */
export async function createTestApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
  extraImports: NonNullable<ModuleMetadata['imports']> = [],
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule, ...extraImports] })
    .overrideProvider(ThrottlerStorage)
    .useValue(new UnlimitedThrottlerStorage());
  const moduleFixture = await configure(builder).compile();

  const app = moduleFixture.createNestApplication();
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
