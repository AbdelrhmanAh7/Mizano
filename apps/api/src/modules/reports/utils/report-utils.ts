import { BadRequestException } from '@nestjs/common';
import {
  AccountType,
  BillStatus,
  ExpenseStatus,
  InvoiceStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Shared rules for every ledger/document report so that all figures reconcile with each other:
 *
 * - Ledger figures come only from posted (`isPosted = true`), non-deleted journals. A posted journal
 *   and its linked reversal are both posted, so they net to zero inside any range containing both.
 * - Date-only query values (`YYYY-MM-DD`) are UTC calendar days; range ends are inclusive to the
 *   last millisecond of that day. Documents and journals store date-only values at UTC midnight.
 * - Money is accumulated with Decimal and returned as fixed 4-dp strings (the DB scale), so sums tie
 *   exactly with the ledger and no float rounding is introduced.
 * - Sign convention: ASSET and EXPENSE are debit-normal; LIABILITY, EQUITY, REVENUE and INCOME are
 *   credit-normal. A "natural" balance is positive on the account's normal side.
 */

export const MONEY_DECIMALS = 4;
const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ReportPrisma = PrismaClient;

export function toDecimal(value: Decimal | string | number | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

/** Decimal → fixed-scale decimal string used on the wire. */
export function money(value: Decimal | string | number | null | undefined): string {
  return toDecimal(value).toFixed(MONEY_DECIMALS);
}

export function sumDecimals(values: Array<Decimal | string | number | null | undefined>): Decimal {
  return values.reduce<Decimal>((sum, v) => sum.add(toDecimal(v)), new Decimal(0));
}

// ── Dates ──────────────────────────────────────────────────────────────────────

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses a report date query value. Date-only values become the start or end (inclusive) of that
 * UTC day; full ISO timestamps are honoured as given. Invalid values are a 400, never a Prisma 500.
 */
export function parseReportDate(
  value: string | undefined | null,
  bound: 'start' | 'end',
  field: string,
): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const [y, m, d] = [Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])];
    const parsed = new Date(Date.UTC(y, m, d));
    if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m || parsed.getUTCDate() !== d) {
      throw new BadRequestException(`${field} is not a valid calendar date`);
    }
    return bound === 'start' ? parsed : endOfUtcDay(parsed);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be an ISO date (YYYY-MM-DD)`);
  }
  return parsed;
}

export interface ResolvedAsOf {
  /** Inclusive upper bound (end of the as-of UTC day unless a timestamp was given). */
  asOf: Date;
  asOfDate: string;
}

/** As-of date for point-in-time reports; defaults to the end of today (UTC). */
export function resolveAsOf(asOfDate?: string | null, now: Date = new Date()): ResolvedAsOf {
  const asOf = parseReportDate(asOfDate, 'end', 'asOfDate') ?? endOfUtcDay(now);
  return { asOf, asOfDate: toIsoDate(asOf) };
}

export interface ResolvedPeriod {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
}

/**
 * Inclusive reporting period. Defaults: end = end of today (UTC); start = 1 January of the end
 * date's year. A start after the end is rejected.
 */
export function resolvePeriod(
  startDate?: string | null,
  endDate?: string | null,
  now: Date = new Date(),
  fields: { start: string; end: string } = { start: 'startDate', end: 'endDate' },
): ResolvedPeriod {
  const end = parseReportDate(endDate, 'end', fields.end) ?? endOfUtcDay(now);
  const start =
    parseReportDate(startDate, 'start', fields.start) ??
    new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  if (start.getTime() > end.getTime()) {
    throw new BadRequestException(`${fields.start} must be on or before ${fields.end}`);
  }
  return { start, end, startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

export interface MonthBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

/** The last `months` calendar months (UTC) ending with the month containing `now`. */
export const MAX_MONTHS = 36;
export const MAX_DAYS = 366;

export function lastMonths(requested: number, now: Date = new Date()): MonthBucket[] {
  // Guard: 0, negative and NaN never reach the loop; huge values are bounded.
  const months = Number.isFinite(requested)
    ? Math.min(MAX_MONTHS, Math.max(1, Math.trunc(requested)))
    : 6;
  const buckets: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 1);
    buckets.push({
      key: monthKey(start),
      label: start.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      start,
      end,
    });
  }
  return buckets;
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Parses an integer query value and clamps it; non-numeric input falls back to the default. */
export function clampInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? NaN : parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// ── Ledger ─────────────────────────────────────────────────────────────────────

export const INCOME_ACCOUNT_TYPES: AccountType[] = [AccountType.REVENUE, AccountType.INCOME];
export const DEBIT_NORMAL_TYPES: AccountType[] = [AccountType.ASSET, AccountType.EXPENSE];

export function isDebitNormal(type: AccountType | string): boolean {
  return (DEBIT_NORMAL_TYPES as string[]).includes(type);
}

export function isIncomeType(type: AccountType | string): boolean {
  return (INCOME_ACCOUNT_TYPES as string[]).includes(type);
}

/** Balance on the account's normal side (positive = normal). */
export function naturalBalance(
  type: AccountType | string,
  debit: Decimal,
  credit: Decimal,
): Decimal {
  return isDebitNormal(type) ? debit.sub(credit) : credit.sub(debit);
}

export function normalSide(type: AccountType | string): 'DEBIT' | 'CREDIT' {
  return isDebitNormal(type) ? 'DEBIT' : 'CREDIT';
}

/** Journals that count in every ledger report: posted, not soft-deleted, this tenant. */
export function postedJournalWhere(
  organizationId: string,
  date?: Prisma.DateTimeFilter,
): Prisma.JournalWhereInput {
  return { organizationId, isPosted: true, deletedAt: null, ...(date ? { date } : {}) };
}

export interface LineTotals {
  debit: Decimal;
  credit: Decimal;
}

/**
 * Sums posted journal lines per account (one grouped query). `accountIds` narrows the accounts;
 * an empty array returns an empty map without querying.
 */
export async function sumPostedLinesByAccount(
  prisma: ReportPrisma,
  organizationId: string,
  date?: Prisma.DateTimeFilter,
  accountIds?: string[],
): Promise<Map<string, LineTotals>> {
  if (accountIds && accountIds.length === 0) return new Map();
  const groups = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      ...(accountIds ? { accountId: { in: accountIds } } : {}),
      journal: postedJournalWhere(organizationId, date),
    },
    _sum: { debit: true, credit: true },
  });
  const totals = new Map<string, LineTotals>();
  for (const group of groups) {
    totals.set(group.accountId, {
      debit: toDecimal(group._sum?.debit),
      credit: toDecimal(group._sum?.credit),
    });
  }
  return totals;
}

export interface PostedLineRow {
  accountId: string;
  journalId: string;
  date: Date;
  debit: Decimal;
  credit: Decimal;
}

/**
 * Posted journal lines of the given accounts with their journal date (one query), for reports that
 * bucket by day/month. Prefer {@link sumPostedLinesByAccount} when no time bucketing is needed.
 */
export async function postedLineRows(
  prisma: ReportPrisma,
  organizationId: string,
  accountIds: string[],
  date?: Prisma.DateTimeFilter,
): Promise<PostedLineRow[]> {
  if (accountIds.length === 0) return [];
  const lines = await prisma.journalLine.findMany({
    where: { accountId: { in: accountIds }, journal: postedJournalWhere(organizationId, date) },
    select: {
      accountId: true,
      journalId: true,
      debit: true,
      credit: true,
      journal: { select: { date: true } },
    },
  });
  return lines.map((l) => ({
    accountId: l.accountId,
    journalId: l.journalId,
    date: l.journal.date,
    debit: toDecimal(l.debit),
    credit: toDecimal(l.credit),
  }));
}

/**
 * Ledger accounts that represent cash or bank: accounts linked to bank accounts, the
 * organisation's default bank/cash accounts and ASSET accounts whose subType is cash/bank. Falls
 * back to the default chart codes 1000/1010 only when nothing is configured.
 */
export async function resolveCashAccountIds(
  prisma: ReportPrisma,
  organizationId: string,
): Promise<string[]> {
  const [org, bankAccounts, typedAccounts] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultBankAccountId: true, defaultCashAccountId: true },
    }),
    prisma.bankAccount.findMany({
      where: { organizationId, deletedAt: null },
      select: { linkedAccountId: true },
    }),
    prisma.account.findMany({
      where: {
        organizationId,
        type: AccountType.ASSET,
        subType: { in: ['cash', 'bank', 'CASH', 'BANK', 'Cash', 'Bank'] },
      },
      select: { id: true },
    }),
  ]);

  const candidateIds = new Set<string>();
  for (const b of bankAccounts ?? []) if (b.linkedAccountId) candidateIds.add(b.linkedAccountId);
  if (org?.defaultBankAccountId) candidateIds.add(org.defaultBankAccountId);
  if (org?.defaultCashAccountId) candidateIds.add(org.defaultCashAccountId);
  for (const a of typedAccounts ?? []) candidateIds.add(a.id);

  // Only ever return this tenant's accounts, whatever a link points at.
  const accounts = await prisma.account.findMany({
    where:
      candidateIds.size > 0
        ? { organizationId, id: { in: [...candidateIds] } }
        : { organizationId, type: AccountType.ASSET, code: { in: ['1000', '1010'] } },
    select: { id: true },
  });
  return (accounts ?? []).map((a) => a.id);
}

// ── Documents ──────────────────────────────────────────────────────────────────

/** Bill statuses that have been approved and posted to the ledger. */
export const POSTED_BILL_STATUSES: BillStatus[] = [
  BillStatus.OPEN,
  BillStatus.PARTIALLY_PAID,
  BillStatus.PAID,
  BillStatus.OVERDUE,
];

/** Invoice statuses that represent an issued receivable (draft and void excluded). */
export const POSTED_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
];

/** Expense statuses that are recorded in the ledger. */
export const POSTED_EXPENSE_STATUSES: ExpenseStatus[] = [
  ExpenseStatus.POSTED,
  ExpenseStatus.RECORDED,
  ExpenseStatus.PAID,
];

/** Document currency; a missing code means the organisation's base currency. */
export function documentCurrency(code: string | null | undefined, baseCurrency: string): string {
  const trimmed = code?.trim();
  return (trimmed || baseCurrency).toUpperCase();
}

export async function getBaseCurrency(
  prisma: ReportPrisma,
  organizationId: string,
): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true, currency: true },
  });
  // Onboarding stores the accountant's choice in baseCurrency; `currency` is a registration default.
  return (org?.baseCurrency || org?.currency || 'USD').toUpperCase();
}

/**
 * Picks the report currency (requested, else base) and partitions documents so that one response
 * never sums two currencies. Returns the documents in the report currency and the other
 * currencies present (so the caller can show them, never add them).
 */
export function splitByCurrency<T>(
  docs: T[],
  currencyOf: (doc: T) => string,
  reportCurrency: string,
): { included: T[]; otherCurrencies: string[] } {
  const included: T[] = [];
  const others = new Set<string>();
  for (const doc of docs) {
    const cur = currencyOf(doc);
    if (cur === reportCurrency) included.push(doc);
    else others.add(cur);
  }
  return { included, otherCurrencies: [...others].sort() };
}

export function normalizeCurrencyParam(
  value: string | undefined | null,
  baseCurrency: string,
): string {
  const trimmed = value?.trim();
  if (!trimmed) return baseCurrency;
  if (!/^[A-Za-z]{3}$/.test(trimmed)) {
    throw new BadRequestException('currency must be a 3-letter ISO 4217 code');
  }
  return trimmed.toUpperCase();
}

// ── Aging ──────────────────────────────────────────────────────────────────────

export type AgingBucketKey = 'current' | 'days1_30' | 'days31_60' | 'days61_90' | 'over90';
export const AGING_BUCKET_KEYS: AgingBucketKey[] = [
  'current',
  'days1_30',
  'days31_60',
  'days61_90',
  'over90',
];

/** Whole UTC calendar days between the due date and the as-of date (negative = not yet due). */
export function daysPastDue(dueDate: Date, asOf: Date): number {
  return Math.round((startOfUtcDay(asOf).getTime() - startOfUtcDay(dueDate).getTime()) / DAY_MS);
}

/** not-due (≤0) / 1–30 / 31–60 / 61–90 / >90 days past due. */
export function agingBucket(days: number): AgingBucketKey {
  if (days <= 0) return 'current';
  if (days <= 30) return 'days1_30';
  if (days <= 60) return 'days31_60';
  if (days <= 90) return 'days61_90';
  return 'over90';
}
