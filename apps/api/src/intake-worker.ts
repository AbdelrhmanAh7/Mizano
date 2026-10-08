import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { writeFile, unlink } from 'fs/promises';
import { describeError } from './common/utils/redact';
import { WORKER_HEARTBEAT_FILE } from './intake-worker-healthcheck';
import { IntakeWorkerModule } from './intake-worker.module';
import { PrismaService } from './prisma/prisma.service';
import { IntakeQueueService } from './modules/ai/intake/intake-queue.service';

const HEARTBEAT_INTERVAL_MS = 5000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(IntakeWorkerModule);
  const prisma = app.get(PrismaService);
  const queue = app.get(IntakeQueueService);
  let probing = false;
  const probe = async (): Promise<void> => {
    if (probing) return;
    probing = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (await queue.isHealthy())
        await writeFile(WORKER_HEARTBEAT_FILE, String(Date.now()), { mode: 0o600 });
    } catch {
      /* A stale heartbeat makes the external probe fail. Never log dependency values. */
    } finally {
      probing = false;
    }
  };
  const timer = setInterval(() => void probe(), HEARTBEAT_INTERVAL_MS);
  timer.unref();
  await probe();
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    // Stop fetching and let the active job finish; Prisma stays connected until it does,
    // because the result or failure write still needs the database.
    await queue.onModuleDestroy();
    await app.close();
    await unlink(WORKER_HEARTBEAT_FILE).catch(() => undefined);
  };
  const stop = (): void => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

void bootstrap().catch((error: unknown) => {
  Logger.error(
    `Intake worker startup failed: ${describeError(error, { includeMessage: false })}`,
    undefined,
    'IntakeWorker',
  );
  process.exitCode = 1;
});
