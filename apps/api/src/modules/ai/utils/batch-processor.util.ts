import { type RiskLevel, isHighRisk } from './risk-level.util';

export interface BatchRiskResult {
  processed: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  failed: number;
}

interface HasRiskLevel {
  riskLevel: RiskLevel | string;
}

/**
 * Processes items in batches using Promise.allSettled and aggregates risk counts.
 *
 * @param items - Array of item IDs or objects to process
 * @param processFn - Async function that processes a single item and returns a result with riskLevel
 * @param batchSize - Number of items to process concurrently (default: 10)
 */
export async function batchProcessWithRiskAggregation<T, R extends HasRiskLevel>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  batchSize = 10,
): Promise<BatchRiskResult> {
  let highRisk = 0;
  let mediumRisk = 0;
  let lowRisk = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(processFn));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const level = result.value.riskLevel as RiskLevel;
        if (isHighRisk(level)) highRisk++;
        else if (level === 'MEDIUM') mediumRisk++;
        else lowRisk++;
      } else {
        failed++;
      }
    }
  }

  return {
    processed: items.length,
    highRisk,
    mediumRisk,
    lowRisk,
    failed,
  };
}
