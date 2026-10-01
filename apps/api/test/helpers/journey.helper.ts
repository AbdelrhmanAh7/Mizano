import { Prisma } from '@prisma/client';

/** Calendar day `offset` days from today (UTC) as YYYY-MM-DD. */
export function isoDay(offset = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** UTC midnight of `day` (YYYY-MM-DD) as a full ISO timestamp, as stored by the API. */
export function midnightIso(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/** Exact decimal comparison for values that may be serialized as a string or a number. */
export function decimalEquals(actual: unknown, expected: string): boolean {
  if (actual === null || actual === undefined) return false;
  return new Prisma.Decimal(String(actual)).equals(expected);
}

export interface JournalLineView {
  accountId: string;
  debit: string;
  credit: string;
}

/** Order-independent journal line signature: `accountId Dr x Cr y`, exact decimals. */
export function lineSignature(lines: JournalLineView[]): string[] {
  return lines
    .map(
      (l) =>
        `${l.accountId} Dr ${new Prisma.Decimal(l.debit).toString()} Cr ${new Prisma.Decimal(
          l.credit,
        ).toString()}`,
    )
    .sort();
}

/**
 * Re-runs `check` until it stops throwing. Only for reads served by the response cache, whose
 * invalidation runs asynchronously after a write's response has been sent.
 */
export async function eventually<T>(check: () => Promise<T>, timeoutMs = 3000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
