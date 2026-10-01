import { Prisma } from '@prisma/client';

/**
 * Serializes ledger-affecting work for one organization until the transaction ends. Journal
 * posting and any change that reinterprets posted amounts (e.g. the base currency) take this
 * same lock, so neither can interleave with the other.
 */
export async function lockOrganizationLedger(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journal:${organizationId}`}))`;
}
