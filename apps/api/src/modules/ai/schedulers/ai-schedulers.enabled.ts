/**
 * AI schedulers are opt-in (issue #133, AC3): the five `ai/schedulers/*` classes
 * are only registered as providers — and their `@Cron` jobs only reach the
 * `SchedulerRegistry` — when `AI_SCHEDULERS_ENABLED=true` is present in the
 * process environment before the module graph loads. `deploy/pi` sets the flag
 * to `false`, and `test/setup-e2e.ts` unsets it so e2e runs never depend on it.
 *
 * The flag is read from `process.env` at import time on purpose: `.env.local`
 * values are only loaded later by ConfigModule, so enabling the schedulers
 * requires exporting the flag in the process environment (shell or container).
 */
export function aiSchedulersEnabled(): boolean {
  return process.env.AI_SCHEDULERS_ENABLED === 'true';
}

/** Returns only the providers that should be registered for the current flag value. */
export function aiSchedulerProviders<T>(providers: T[]): T[] {
  return aiSchedulersEnabled() ? providers : [];
}
