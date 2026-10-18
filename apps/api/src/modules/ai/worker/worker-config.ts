/**
 * Without REDIS_URL, IntakeQueueService falls back to an in-process queue. That is right for the
 * API in unit tests, but a separate worker process would then consume a private queue and silently
 * never see the jobs the API enqueued, so the worker refuses to start.
 */
export function assertWorkerQueueConfigured(config: {
  get: (key: string) => string | undefined;
}): void {
  if (!config.get('REDIS_URL')?.trim()) {
    throw new Error('REDIS_URL is required: the intake worker shares its queue with the API');
  }
}
