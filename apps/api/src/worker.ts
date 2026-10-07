import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { describeError } from './common/utils/redact';
import { IntakeQueueService } from './modules/ai/intake/intake-queue.service';
import { resolveLogLevels } from './modules/logger/log-level';
import {
  HEARTBEAT_INTERVAL_MS,
  beat,
  heartbeatIsFresh,
  resolveHeartbeatFile,
} from './worker-heartbeat';
import { WorkerModule } from './worker.module';

/**
 * Intake worker entrypoint (`node dist/worker.js`). Consumes the BullMQ intake
 * queue that the API fills; run the API with INTAKE_WORKER_ENABLED=false so
 * only this process extracts documents.
 * `node dist/worker.js --healthcheck` exits 0 while the heartbeat is fresh.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  app.useLogger(resolveLogLevels(config.get<string>('LOG_LEVEL'), config.get<string>('NODE_ENV')));
  const logger = new Logger('Worker');

  if (!config.get<string>('REDIS_URL')) {
    logger.error('REDIS_URL is required: the worker consumes the intake queue in Redis');
    await app.close();
    process.exit(1);
  }

  app.enableShutdownHooks();
  const queue = app.get(IntakeQueueService);
  // ConfigModule has loaded the env files into process.env by now.
  const file = resolveHeartbeatFile();
  const tick = (): void => {
    try {
      beat(file, () => queue.isConsuming());
    } catch {
      logger.warn('Could not write the worker heartbeat file');
    }
  };
  tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS);

  logger.log(`Intake worker consuming (concurrency=${queue.concurrency})`);
}

if (process.argv.includes('--healthcheck')) {
  // No Nest context here (this runs every 30 s): read the same env files ConfigModule would.
  process.exit(heartbeatIsFresh(resolveHeartbeatFile()) ? 0 : 1);
} else {
  bootstrap().catch((err: unknown) => {
    // Dependency errors can quote connection strings: log the type only, never the message.
    Logger.error(
      `Worker failed to start: ${describeError(err, { includeMessage: false })}`,
      'WorkerBootstrap',
    );
    process.exit(1);
  });
}
