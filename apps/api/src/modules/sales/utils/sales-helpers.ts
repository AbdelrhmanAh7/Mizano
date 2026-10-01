import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountType, BankAccountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DocumentTotals } from '../../../common/utils/document-totals';

/** Money columns are Decimal(19, 4): more precision than that cannot be stored. */
const MONEY_SCALE = 4;

/**
 * Parses a decimal-string amount that must be strictly positive and storable as Decimal(19, 4).
 * Throws a 400 naming the field; never goes through a JS number.
 */
export function parsePositiveDecimal(value: string, field: string): Decimal {
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal number`);
  }
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new BadRequestException(`${field} must be greater than zero`);
  }
  if (amount.decimalPlaces() > MONEY_SCALE) {
    throw new BadRequestException(`${field} must have at most ${MONEY_SCALE} decimal places`);
  }
  return amount;
}

/** Decimal(19, 4) leaves 15 integer digits. */
const MAX_INTEGER_DIGITS = 15;
const MONEY_CEILING = new Decimal(10).pow(MAX_INTEGER_DIGITS);

/** Rejects (400) an amount whose integer part cannot be stored in a Decimal(19, 4) column. */
export function assertMoneyFits(value: Decimal, field: string): void {
  if (value.abs().greaterThanOrEqualTo(MONEY_CEILING)) {
    throw new BadRequestException(`${field} is too large (at most ${MAX_INTEGER_DIGITS} digits)`);
  }
}

/** Every computed line amount and document total must fit Decimal(19, 4) before anything is written. */
export function assertTotalsFit(totals: DocumentTotals): void {
  totals.lines.forEach((line, i) => {
    assertMoneyFits(line.netAmount, `lines[${i}] amount`);
    assertMoneyFits(line.taxAmount, `lines[${i}] tax`);
  });
  assertMoneyFits(totals.subtotal, 'subtotal');
  assertMoneyFits(totals.taxAmount, 'tax amount');
  assertMoneyFits(totals.shipping, 'shipping');
  assertMoneyFits(totals.grandTotal, 'grand total');
}

/**
 * Authoritative rule for "bank or cash account" in sales: an active, non-deleted ASSET account
 * of the organization that is either the organization's default bank/cash account, or the
 * linked ledger account of an active bank-register account (BANK or PETTY_CASH; credit cards
 * are liabilities and excluded). Account (and bank-register) currency must equal the
 * organization's base currency. Used both to list refund accounts and to validate a REFUND.
 */
export async function bankCashAccountWhere(
  db: Prisma.TransactionClient,
  organizationId: string,
): Promise<Prisma.AccountWhereInput> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { defaultBankAccountId: true, defaultCashAccountId: true, baseCurrency: true },
  });
  const baseCurrency = org?.baseCurrency;
  const defaultIds = [org?.defaultBankAccountId, org?.defaultCashAccountId].filter(
    (id): id is string => !!id,
  );
  return {
    organizationId,
    deletedAt: null,
    isActive: true,
    type: AccountType.ASSET,
    // The ledger is single-currency: a refund account in another currency would post foreign
    // amounts as base currency.
    ...(baseCurrency ? { currency: { equals: baseCurrency, mode: 'insensitive' } } : {}),
    OR: [
      { id: { in: defaultIds } },
      {
        bankAccounts: {
          some: {
            organizationId,
            deletedAt: null,
            isActive: true,
            ...(baseCurrency ? { currency: { equals: baseCurrency, mode: 'insensitive' } } : {}),
            type: { in: [BankAccountType.BANK, BankAccountType.PETTY_CASH] },
          },
        },
      },
    ],
  };
}

/** Parses a document date (ISO date or timestamp); throws a 400 for anything unparseable. */
export function parseDocumentDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${field}`);
  return date;
}

/** Midnight UTC of today: a document due today is not yet overdue. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** Maps a unique-constraint violation on a document number to a 409. */
export function mapDocumentNumberConflict(error: unknown, label: string): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException(`${label} number already exists; please retry`);
  }
  return error;
}

/**
 * Reserves the organization's next invoice number from its configured counter
 * (Settings -> Invoicing: prefix + next number), e.g. `INV-0007`. The counter row is locked by
 * the increment until the surrounding transaction ends, so concurrent creations never receive the
 * same number, and a rolled-back transaction gives its number back. Numbers already in use (for
 * example invoices created before the counter was honoured) are skipped.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const org = await tx.organization.update({
      where: { id: organizationId },
      data: { invoiceNextNumber: { increment: 1 } },
      select: { invoicePrefix: true, invoiceNextNumber: true },
    });
    const candidate = `${org.invoicePrefix}${String(org.invoiceNextNumber - 1).padStart(4, '0')}`;
    const taken = await tx.invoice.count({ where: { organizationId, invoiceNumber: candidate } });
    if (taken === 0) return candidate;
  }
  throw new ConflictException('Could not allocate an invoice number; check Settings -> Invoicing');
}

/** Same counter approach for quotes (Settings -> Invoicing: quote prefix + next number). */
export async function allocateQuoteNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const org = await tx.organization.update({
      where: { id: organizationId },
      data: { quoteNextNumber: { increment: 1 } },
      select: { quotePrefix: true, quoteNextNumber: true },
    });
    const candidate = `${org.quotePrefix}${String(org.quoteNextNumber - 1).padStart(4, '0')}`;
    const taken = await tx.quote.count({ where: { organizationId, quoteNumber: candidate } });
    if (taken === 0) return candidate;
  }
  throw new ConflictException('Could not allocate a quote number; check Settings -> Invoicing');
}

/**
 * Next `PMT-nnn` for the organization. Serialized per organization by a transaction-scoped
 * advisory lock, so concurrent payments cannot read the same maximum.
 */
export async function nextPaymentReceivedNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment-received:${organizationId}`}))`;
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("paymentNumber" FROM '^PMT-([0-9]+)$') AS INTEGER)) AS max
    FROM "payments_received" WHERE "organizationId" = ${organizationId}`;
  const last = Number(rows?.[0]?.max ?? 0);
  return `PMT-${String(last + 1).padStart(3, '0')}`;
}

/** Next `CN-nnn` for the organization, serialized like {@link nextPaymentReceivedNumber}. */
export async function nextCreditNoteNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credit-note:${organizationId}`}))`;
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("creditNoteNumber" FROM '^CN-([0-9]+)$') AS INTEGER)) AS max
    FROM "credit_notes" WHERE "organizationId" = ${organizationId}`;
  const last = Number(rows?.[0]?.max ?? 0);
  return `CN-${String(last + 1).padStart(3, '0')}`;
}
