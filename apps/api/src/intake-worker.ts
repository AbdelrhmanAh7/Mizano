import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { writeFile, unlink } from 'fs/promises';
import { describeError } from './common/utils/redact';
import { WORKER_HEARTBEAT_FILE } from './intake-worker-healthcheck';
import { createIntakeWorker, registerGracefulShutdown } from './modules/ai/intake/intake.worker';
import { PrismaService } from './prisma/prisma.service';
import { IntakeQueueService } from './modules/ai/intake/intake-queue.service';
import { IntakeExecutorService } from './modules/ai/intake/intake-executor.service';

const HEARTBEAT_INTERVAL_MS = 5000;

async function bootstrap(): Promise<void> {
  const app = await createIntakeWorker();
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
  registerGracefulShutdown(
    async () => {
      clearInterval(timer);
      // Stop fetching first, so no new job is claimed once the executor refuses work, then kill
      // the active child so the drain finishes inside the container's stop grace period.
      // Prisma stays connected until the drain ends: the failure write still needs the database.
      const draining = queue.onModuleDestroy();
      try {
        app.get(IntakeExecutorService, { strict: false })?.onModuleDestroy();
      } catch {
        /* optional if executor not registered */
      }
      await draining;
      await app.close();
      await unlink(WORKER_HEARTBEAT_FILE).catch(() => undefined);
    },
    {
      exit: (code) => {
        // Explicit exit ensures the process terminates even if sockets leak.
        process.exit(code);
      },
    },
  );
}

void bootstrap().catch((error: unknown) => {
  Logger.error(
    `Intake worker startup failed: ${describeError(error, { includeMessage: false })}`,
    undefined,
    'IntakeWorker',
  );
  process.exitCode = 1;
});
