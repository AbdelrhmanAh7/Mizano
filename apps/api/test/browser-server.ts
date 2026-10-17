import { Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';

class BrowserThrottlerStorage implements ThrottlerStorage {
  async increment(_key: string, ttl: number): ReturnType<ThrottlerStorage['increment']> {
    return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
  }
}

/** Dedicated synthetic browser harness; same test-only rate-counter override as API E2E. */
async function bootstrap(): Promise<void> {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (
    database.hostname !== '127.0.0.1' ||
    database.protocol !== 'postgresql:' ||
    database.port !== '5435' ||
    database.pathname !== '/mizano_e2e_cxe2e' ||
    database.search ||
    process.env.READ_DATABASE_URL !== process.env.DATABASE_URL
  ) {
    throw new Error('Browser server requires the isolated cxe2e database');
  }
  // Suppress constructor/bootstrap logs as well as request logs in this synthetic harness.
  Logger.overrideLogger(false);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue(new BrowserThrottlerStorage())
    .compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors({ origin: 'http://127.0.0.1:5103', credentials: true });
  app.enableShutdownHooks();
  await app.listen(6103, '127.0.0.1');
}

void bootstrap().catch((error: unknown) => {
  // Do not dump connection strings or raw bootstrap errors.
  const kind = error instanceof Error ? error.name : 'UnknownError';
  process.stderr.write(`Browser API harness failed to start (${kind})\n`);
  process.exitCode = 1;
});
