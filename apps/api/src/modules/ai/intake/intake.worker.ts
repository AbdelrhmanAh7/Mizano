import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IntakeWorkerModule } from '../../../intake-worker.module';

/**
 * Boots the intake consumer without an HTTP adapter: no listener, no port. The returned context
 * is already initialised (queue worker registered); callers resolve services from it and
 * `await app.close()` to stop it.
 */
export function createIntakeWorker(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(IntakeWorkerModule);
}

export interface ShutdownOptions {
  signals?: { once(event: 'SIGTERM' | 'SIGINT', listener: () => void): unknown };
  exit?: (code: number) => void;
}

/**
 * Runs `close` on the first SIGTERM/SIGINT, then ends the process explicitly: a leaked socket
 * (Redis, BullMQ) must not hold it open until Docker's SIGKILL. `close` must finish stopping the
 * queue and the database first; the exit code is 0 on success and 1 on any error.
 */
export function registerGracefulShutdown(
  close: () => Promise<void>,
  { signals = process, exit = (code) => process.exit(code) }: ShutdownOptions = {},
): void {
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    close().then(
      () => exit(0),
      () => exit(1),
    );
  };
  signals.once('SIGTERM', stop);
  signals.once('SIGINT', stop);
}
