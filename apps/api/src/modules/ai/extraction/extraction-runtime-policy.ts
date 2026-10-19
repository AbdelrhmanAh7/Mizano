/**
 * Extraction runtime policy — pure admission control for the CPU extraction worker.
 *
 * Determines which queued jobs to admit based on concurrency, memory budget and
 * API-slot reservation. Classifies per-document latency against type-specific budgets.
 *
 * Part of #42. All values are explicit placeholders until measured on the target host.
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Runtime resource caps for the extraction worker. */
export interface ExtractionCaps {
  /** Max concurrent extraction jobs (1–2 on constrained hosts). */
  readonly maxConcurrency: number;
  /** Bytes of RSS the worker may consume across all admitted jobs. */
  readonly memoryBudgetBytes: number;
  /** Slots reserved exclusively for API-priority jobs (e.g. interactive scans). */
  readonly reservedApiSlots: number;
}

/** A queued extraction job for admission planning. */
export interface QueuedJob {
  readonly id: string;
  /** 'api' jobs get priority admission; 'ocr' jobs fill remaining slots. */
  readonly priority: 'api' | 'ocr';
  /** Estimated resident set size this job will consume. */
  readonly estimatedRssBytes: number;
  /** The document type being extracted. */
  readonly documentType: string;
}

/** Per-document-type latency budgets in milliseconds. */
export interface LatencyBudgets {
  readonly [documentType: string]: number;
}

export interface LatencyCompleted {
  readonly status: 'completed';
}

export interface LatencyException {
  readonly status: 'exception';
  readonly reason: 'latency_budget_exceeded';
}

export type LatencyClassification = LatencyCompleted | LatencyException;

// ---------------------------------------------------------------------------
// Default placeholder caps (to be replaced with measured values)
// ---------------------------------------------------------------------------

/** Placeholder caps for a constrained arm64 host. */
export const DEFAULT_CAPS: ExtractionCaps = {
  maxConcurrency: 2,
  memoryBudgetBytes: 2_000_000_000, // 2 GB
  reservedApiSlots: 1,
};

/** Placeholder latency budgets in milliseconds. */
export const DEFAULT_LATENCY_BUDGETS: LatencyBudgets = {
  invoice: 30_000,
  receipt: 20_000,
  unknown: 60_000,
};

// ---------------------------------------------------------------------------
// Admission planning
// ---------------------------------------------------------------------------

/**
 * Select which queued jobs to admit given resource caps.
 *
 * Rules (in order):
 * 1. API-priority jobs are admitted first, in queue order.
 * 2. OCR jobs fill remaining slots up to (maxConcurrency - reservedApiSlots).
 * 3. A job is skipped (not admitted) if including it would push the cumulative
 *    estimatedRssBytes above memoryBudgetBytes.
 * 4. Admission stops once maxConcurrency slots are filled.
 *
 * @returns The ordered list of admitted jobs (API-priority first, then OCR).
 */
export function planAdmission(queue: readonly QueuedJob[], caps: ExtractionCaps): QueuedJob[] {
  const apiJobs = queue.filter((j) => j.priority === 'api');
  const ocrJobs = queue.filter((j) => j.priority === 'ocr');

  const admitted: QueuedJob[] = [];
  let usedBytes = 0;
  let slotsUsed = 0;

  // Phase 1: admit API-priority jobs first
  for (const job of apiJobs) {
    if (slotsUsed >= caps.maxConcurrency) break;
    if (usedBytes + job.estimatedRssBytes > caps.memoryBudgetBytes) continue;
    admitted.push(job);
    usedBytes += job.estimatedRssBytes;
    slotsUsed += 1;
  }

  // Phase 2: admit OCR jobs into remaining non-reserved slots
  const maxOcrSlots = Math.max(0, caps.maxConcurrency - caps.reservedApiSlots);
  let ocrSlotsUsed = 0;

  for (const job of ocrJobs) {
    if (slotsUsed >= caps.maxConcurrency) break;
    if (ocrSlotsUsed >= maxOcrSlots) break;
    if (usedBytes + job.estimatedRssBytes > caps.memoryBudgetBytes) continue;
    admitted.push(job);
    usedBytes += job.estimatedRssBytes;
    slotsUsed += 1;
    ocrSlotsUsed += 1;
  }

  return admitted;
}

// ---------------------------------------------------------------------------
// Latency classification
// ---------------------------------------------------------------------------

/**
 * Classify whether a completed extraction met its latency budget.
 *
 * @returns `{status:'completed'}` if elapsedMs is at or below the budget,
 *          `{status:'exception', reason:'latency_budget_exceeded'}` if above.
 *          Documents with no configured budget are always classified as completed.
 */
export function classifyLatency(
  documentType: string,
  elapsedMs: number,
  budgets: LatencyBudgets,
): LatencyClassification {
  const budget = budgets[documentType];
  if (budget === undefined || elapsedMs <= budget) {
    return { status: 'completed' };
  }
  return { status: 'exception', reason: 'latency_budget_exceeded' };
}
