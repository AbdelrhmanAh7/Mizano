import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiWorkerModule } from './modules/ai/worker/ai-worker.module';
import { assertWorkerQueueConfigured } from './modules/ai/worker/worker-config';
import { describeError } from './common/utils/redact';
import { resolveLogLevels } from './modules/logger/log-level';

async function bootstrap(): Promise<void> {
  // AiWorkerModule's ConfigModule has loaded the env files into process.env by now.
  assertWorkerQueueConfigured({ get: (key) => process.env[key] });
  const app = await NestFactory.createApplicationContext(AiWorkerModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  app.useLogger(
    resolveLogLevels(configService.get<string>('LOG_LEVEL'), configService.get<string>('NODE_ENV')),
  );
  const logger = new Logger('IntakeWorker');

  // IntakeProcessorService registers the queue handler on init; the process stays alive
  // consuming jobs from the BullMQ queue.

  // Listen for SIGTERM/SIGINT to close connections cleanly before exit
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down intake worker...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.log('Intake worker started, waiting for jobs...');
}

bootstrap().catch((error: unknown) => {
  new Logger('IntakeWorker').error(describeError(error));
  // NestFactory buffers logs until the app is up; flush so the reason reaches the container log.
  Logger.flush();
  process.exit(1);
});
