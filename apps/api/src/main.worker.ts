import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiWorkerModule } from './modules/ai/worker/ai-worker.module';
import { resolveLogLevels } from './modules/logger/log-level';

async function bootstrap(): Promise<void> {
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

void bootstrap();
