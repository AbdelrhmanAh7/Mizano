import { performance } from 'perf_hooks';

/** Millisecond readings from a monotonic source. Injected so tests are deterministic. */
export type Clock = () => number;

/** Nest token for the intake worker clock; tests override it with a fake. */
export const INTAKE_CLOCK = 'INTAKE_CLOCK';

export const monotonicClock: Clock = () => performance.now();

/**
 * Times consecutive named stages. It is diagnostics only and never throws: a
 * failing or non-finite clock reading drops the affected stage instead of
 * failing the caller. It stores stage names and durations, nothing else.
 */
export class StageTimer {
  private readonly timings: Record<string, number> = {};
  private current: { stage: string; startedAt: number } | null = null;

  constructor(private readonly clock: Clock = monotonicClock) {}

  /** Ends the running stage, if any, and starts `stage` at the same reading. */
  start(stage: string): void {
    const at = this.read();
    this.finish(at);
    this.current = at === null ? null : { stage, startedAt: at };
  }

  /** Ends the running stage, if any. */
  stop(): void {
    if (this.current) this.finish(this.read());
  }

  /** Whole, non-negative milliseconds per finished stage. */
  snapshot(): Record<string, number> {
    return { ...this.timings };
  }

  private read(): number | null {
    try {
      const at = this.clock();
      return Number.isFinite(at) ? at : null;
    } catch {
      return null;
    }
  }

  private finish(at: number | null): void {
    const running = this.current;
    this.current = null;
    if (!running || at === null) return;
    const ms = Math.max(0, Math.round(at - running.startedAt));
    this.timings[running.stage] = (this.timings[running.stage] ?? 0) + ms;
  }
}
