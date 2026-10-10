import { BulkResultDto } from '../dto/bulk-result.dto';

import { HttpException } from '@nestjs/common';

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
      let reason = 'Unknown error';
      let code: string | undefined;

      if (error instanceof HttpException) {
        const response = error.getResponse() as Record<string, unknown> | string;
        reason =
          typeof response === 'string'
            ? response
            : typeof response.message === 'string'
              ? response.message
              : error.message;
        code =
          typeof response === 'object' && typeof response.code === 'string'
            ? response.code
            : undefined;
      } else if (error instanceof Error) {
        reason = error.message;
        const errObj = error as unknown as Record<string, unknown>;
        code = typeof errObj.code === 'string' ? errObj.code : undefined;
      }

      failures.push({ id, reason, code });
    }
  }
  return { processed, total: unique.length, failures };
}
