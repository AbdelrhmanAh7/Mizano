import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Centralized, transaction-safe document number generation.
 *
 * Uses a `DocumentSequence` row per (organizationId, prefix) pair.
 * An atomic SQL `INSERT ... ON CONFLICT DO UPDATE` statement locks the row
 * and increments the counter in a single round-trip, eliminating race conditions
 * even under concurrent requests.
 *
 * Supported prefixes: INV, BILL, JRN, QT, CN, PMT, VPMT, ADJ, WO, DC, VC, AST
 *
 * @example
 * ```ts
 * // Inside an existing Prisma transaction:
 * const number = await this.docNumberService.next(tx, orgId, 'INV'); // "INV-001"
 *
 * // Standalone (creates its own transaction):
 * const number = await this.docNumberService.nextStandalone(orgId, 'BILL'); // "BILL-001"
 * ```
 */
@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next document number within a Prisma transaction.
   *
   * @param tx       Prisma transaction client
   * @param orgId    Organization ID
   * @param prefix   Document prefix (e.g. 'INV', 'BILL')
   * @param padLen   Minimum digits (default 3 → INV-001)
   * @returns        e.g. "INV-001", "BILL-042"
   */
  async next(
    tx: Prisma.TransactionClient,
    orgId: string,
    prefix: string,
    padLen = 3,
  ): Promise<string> {
    // Upsert + atomic increment in one statement.
    // Postgres INSERT … ON CONFLICT locks the row, preventing duplicates.
    const result = await tx.$queryRaw<{ next_number: number }[]>`
      INSERT INTO "document_sequences" ("id", "prefix", "nextNumber", "padLength", "organizationId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${prefix}, 2, ${padLen}, ${orgId}, NOW(), NOW())
      ON CONFLICT ("organizationId", "prefix")
      DO UPDATE SET "nextNumber" = "document_sequences"."nextNumber" + 1, "updatedAt" = NOW()
      RETURNING "nextNumber" - 1 AS next_number
    `;

    const num = result[0].next_number;
    return `${prefix}-${String(num).padStart(padLen, '0')}`;
  }

  /**
   * Generate the next document number outside a transaction.
   * Creates its own `$transaction` for atomicity when no surrounding transaction exists.
   *
   * @param orgId  - Organization ID
   * @param prefix - Document prefix (e.g. 'INV', 'BILL')
   * @param padLen - Minimum digits (default 3)
   * @returns Formatted document number (e.g. "INV-001")
   */
  async nextStandalone(orgId: string, prefix: string, padLen = 3): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      return this.next(tx, orgId, prefix, padLen);
    });
  }

  /**
   * Seed a sequence to start at a specific number.
   * Useful during data migration or initial onboarding to align with existing numbering.
   *
   * @param orgId   - Organization ID
   * @param prefix  - Document prefix (e.g. 'INV')
   * @param startAt - The next number to be issued (e.g. 100 means next doc is "INV-100")
   * @param padLen  - Minimum digits (default 3)
   */
  async seed(orgId: string, prefix: string, startAt: number, padLen = 3): Promise<void> {
    await this.prisma.documentSequence.upsert({
      where: {
        organizationId_prefix: { organizationId: orgId, prefix },
      },
      create: {
        prefix,
        nextNumber: startAt,
        padLength: padLen,
        organizationId: orgId,
      },
      update: {
        nextNumber: startAt,
        padLength: padLen,
      },
    });
  }
}
