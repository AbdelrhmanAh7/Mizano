import {
  planAdmission,
  classifyLatency,
  DEFAULT_CAPS,
  DEFAULT_LATENCY_BUDGETS,
  type ExtractionCaps,
  type QueuedJob,
  type LatencyBudgets,
} from './extraction-runtime-policy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function job(
  id: string,
  priority: 'api' | 'ocr',
  estimatedRssBytes: number,
  documentType = 'invoice',
): QueuedJob {
  return { id, priority, estimatedRssBytes, documentType };
}

const CAPS: ExtractionCaps = {
  maxConcurrency: 2,
  reservedApiSlots: 1,
  memoryBudgetBytes: 2_000_000_000,
};

// ---------------------------------------------------------------------------
// planAdmission
// ---------------------------------------------------------------------------

describe('planAdmission', () => {
  it('admits API-priority job plus at most 1 OCR job when reservedApiSlots=1 and maxConcurrency=2', () => {
    const queue: QueuedJob[] = [
      job('ocr-1', 'ocr', 400_000_000),
      job('ocr-2', 'ocr', 400_000_000),
      job('ocr-3', 'ocr', 400_000_000),
      job('api-1', 'api', 300_000_000),
    ];

    const admitted = planAdmission(queue, CAPS);

    // API-priority first, then at most 1 OCR (maxConcurrency 2 - reservedApiSlots 1 = 1)
    expect(admitted).toHaveLength(2);
    expect(admitted[0].id).toBe('api-1');
    expect(admitted[0].priority).toBe('api');
    expect(admitted[1].priority).toBe('ocr');
  });

  it('admits API-priority jobs before OCR jobs regardless of queue order', () => {
    const queue: QueuedJob[] = [
      job('ocr-1', 'ocr', 100_000_000),
      job('api-1', 'api', 100_000_000),
      job('ocr-2', 'ocr', 100_000_000),
    ];

    const admitted = planAdmission(queue, CAPS);
    expect(admitted[0].id).toBe('api-1');
  });

  it('never exceeds maxConcurrency', () => {
    const caps: ExtractionCaps = {
      maxConcurrency: 1,
      reservedApiSlots: 0,
      memoryBudgetBytes: 10_000_000_000,
    };
    const queue: QueuedJob[] = [job('a', 'ocr', 100), job('b', 'ocr', 100)];

    expect(planAdmission(queue, caps)).toHaveLength(1);
  });

  it('never admits a plan whose summed estimatedRssBytes exceeds memoryBudgetBytes', () => {
    const caps: ExtractionCaps = {
      maxConcurrency: 10,
      reservedApiSlots: 0,
      memoryBudgetBytes: 1_000_000_000,
    };
    const queue: QueuedJob[] = [
      job('a', 'ocr', 600_000_000),
      job('b', 'ocr', 600_000_000),
      job('c', 'ocr', 300_000_000),
    ];

    const admitted = planAdmission(queue, caps);
    const totalBytes = admitted.reduce((s, j) => s + j.estimatedRssBytes, 0);
    expect(totalBytes).toBeLessThanOrEqual(caps.memoryBudgetBytes);
  });

  it('skips an oversized job and continues with smaller ones', () => {
    const caps: ExtractionCaps = {
      maxConcurrency: 3,
      reservedApiSlots: 0,
      memoryBudgetBytes: 1_000_000_000,
    };
    const queue: QueuedJob[] = [
      job('big', 'ocr', 900_000_000),
      job('small-1', 'ocr', 400_000_000),
      job('small-2', 'ocr', 400_000_000),
    ];

    const admitted = planAdmission(queue, caps);
    // big (900M) admitted first, then small-1 (400M) would exceed 1G → skipped,
    // small-2 (400M) also exceeds → skipped. Only big admitted.
    // Actually: 900 + 400 = 1300 > 1000, so small-1 skipped; 900 + 400 = 1300 > 1000, small-2 skipped.
    expect(admitted.map((j) => j.id)).toEqual(['big']);
  });

  it('skips an oversized first job and admits a smaller later one', () => {
    const caps: ExtractionCaps = {
      maxConcurrency: 3,
      reservedApiSlots: 0,
      memoryBudgetBytes: 500_000_000,
    };
    const queue: QueuedJob[] = [job('huge', 'ocr', 800_000_000), job('small', 'ocr', 200_000_000)];

    const admitted = planAdmission(queue, caps);
    expect(admitted.map((j) => j.id)).toEqual(['small']);
  });

  it('returns an empty plan when the queue is empty', () => {
    expect(planAdmission([], CAPS)).toEqual([]);
  });

  it('fills all slots when memory and concurrency allow', () => {
    const caps: ExtractionCaps = {
      maxConcurrency: 2,
      reservedApiSlots: 0,
      memoryBudgetBytes: 10_000_000_000,
    };
    const queue: QueuedJob[] = [job('a', 'ocr', 100_000_000), job('b', 'ocr', 100_000_000)];

    expect(planAdmission(queue, caps)).toHaveLength(2);
  });

  it('exports sensible default caps', () => {
    expect(DEFAULT_CAPS.maxConcurrency).toBe(2);
    expect(DEFAULT_CAPS.memoryBudgetBytes).toBe(2_000_000_000);
    expect(DEFAULT_CAPS.reservedApiSlots).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// classifyLatency
// ---------------------------------------------------------------------------

describe('classifyLatency', () => {
  const budgets: LatencyBudgets = { invoice: 30_000, receipt: 20_000 };

  it('returns exception with reason latency_budget_exceeded above budget', () => {
    const result = classifyLatency('invoice', 45_000, budgets);
    expect(result).toEqual({
      status: 'exception',
      reason: 'latency_budget_exceeded',
    });
  });

  it('returns completed at the exact budget boundary', () => {
    expect(classifyLatency('invoice', 30_000, budgets)).toEqual({
      status: 'completed',
    });
  });

  it('returns completed below budget', () => {
    expect(classifyLatency('invoice', 1_000, budgets)).toEqual({
      status: 'completed',
    });
  });

  it('returns completed for unknown document types (no budget configured)', () => {
    expect(classifyLatency('contract', 999_999, budgets)).toEqual({
      status: 'completed',
    });
  });

  it('exports sensible default latency budgets', () => {
    expect(DEFAULT_LATENCY_BUDGETS).toHaveProperty('invoice');
    expect(DEFAULT_LATENCY_BUDGETS).toHaveProperty('receipt');
    expect(DEFAULT_LATENCY_BUDGETS).toHaveProperty('unknown');
  });
});
