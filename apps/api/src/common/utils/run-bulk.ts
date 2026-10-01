import { BulkResultDto } from '../dto/bulk-result.dto';

/**
 * Runs a single-record command for each id (sequentially, de-duplicated) and reports
 * per-record outcomes. Bulk operations must reuse the same command as the single-record
 * route so ledger effects, tenant checks and period locks are identical.
 */
export async function runBulk(
  ids: string[],
  command: (id: string) => Promise<unknown>,
): Promise<BulkResultDto> {
  const unique = [...new Set(ids)];
  const failures: BulkResultDto['failures'] = [];
  let processed = 0;
  for (const id of unique) {
    try {
      await command(id);
      processed++;
    } catch (error) {
      failures.push({ id, reason: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  return { processed, total: unique.length, failures };
}
