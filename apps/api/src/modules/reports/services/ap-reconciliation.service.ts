import { Injectable } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { JournalSourceType } from '../../accounting/services/journals.service';
import {
  POSTED_BILL_STATUSES,
  ReportPrisma,
  endOfUtcDay,
  getBaseCurrency,
  parseReportDate,
  sumPostedLinesByAccount,
  toDecimal,
  toIsoDate,
} from '../utils/report-utils';

export interface ApReconciliation {
  asOf: string;
  currencyCode: string;
  subledgerTotal: string;
  controlBalance: string;
  /** subledgerTotal − controlBalance. */
  difference: string;
  ok: boolean;
}

export interface ApReconciliationOptions {
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

// Prevent rounding when ledger totals of many near-max Decimal(19,4) amounts pass Decimal's default 20 digits.
const Wide = Decimal.clone({ precision: 40 });
const wide = (value: Decimal | string | null | undefined): Decimal =>
  new Wide(toDecimal(value).toFixed());

/** Source-less journals written before journal source linking carry only this reference prefix. */
const LEGACY_AP_REFERENCES = { credit: ['Bill '], debit: ['Payment ', 'Vendor Credit '] };

@Injectable()
export class ApReconciliationService {
  constructor(private prisma: ReadReplicaService) {}

  /**
   * Read-only check that the AP subledger ties to the AP control account as of a date (#320).
   * Read in one transaction (RepeatableRead by default, configurable) to prevent posting skew.
   * Subledger: open balances of posted bills <= asOf (less live unapplied vendor credits,
   * adjusted for post-cutoff settlements, voids, and prepayments).
   * Control: posted journal lines <= asOf on AP liability control accounts.
   */
  async reconcileApControl(
    organizationId: string,
    asOfDate?: string,
    options?: ApReconciliationOptions,
  ): Promise<ApReconciliation> {
    const asOf = parseReportDate(asOfDate, 'end', 'asOf') ?? endOfUtcDay(new Date());
    const timeout =
      options?.timeout ??
      (process.env.AP_RECONCILIATION_TIMEOUT_MS
        ? Number(process.env.AP_RECONCILIATION_TIMEOUT_MS)
        : 15_000);
    const isolationLevel =
      options?.isolationLevel ??
      (process.env.AP_RECONCILIATION_ISOLATION_LEVEL as Prisma.TransactionIsolationLevel) ??
      Prisma.TransactionIsolationLevel.RepeatableRead;

    return this.prisma.$transaction((tx) => this.reconcile(tx, organizationId, asOf), {
      isolationLevel,
      timeout,
    });
  }

  private async reconcile(
    tx: Prisma.TransactionClient,
    organizationId: string,
    asOf: Date,
  ): Promise<ApReconciliation> {
    const later = { gt: asOf };
    const notDeletedAt = { OR: [{ deletedAt: null }, { deletedAt: later }] };
    const live: Prisma.BillWhereInput = {
      organizationId,
      deletedAt: null,
      status: { in: POSTED_BILL_STATUSES },
    };
    const bill: Prisma.BillWhereInput = { ...live, date: { lte: asOf } };
    // Payments in effect on `asOf`: dated by then and not voided until later.
    const paymentInEffect: Prisma.PaymentMadeWhereInput = {
      organizationId,
      date: { lte: asOf },
      ...notDeletedAt,
    };

    const [open, paidLater, voidedLater, prepaid, appliedLater, unapplied, voidedAfter, control] =
      await Promise.all([
        tx.bill.aggregate({ where: bill, _sum: { balanceDue: true } }),
        tx.billAllocation.aggregate({
          where: { bill, payment: { organizationId, deletedAt: null, date: later } },
          _sum: { amount: true },
        }),
        tx.billAllocation.aggregate({
          where: { bill, payment: { organizationId, date: { lte: asOf }, deletedAt: later } },
          _sum: { amount: true },
        }),
        tx.billAllocation.aggregate({
          where: { bill: { ...live, date: later }, payment: paymentInEffect },
          _sum: { amount: true },
        }),
        tx.vendorCredit.aggregate({
          where: { organizationId, deletedAt: null, date: later, appliedToBill: bill },
          _sum: { amount: true },
        }),
        // Unapplied as of asOf: not yet voided/refunded then, and not applied to a bill counting on that date.
        tx.vendorCredit.aggregate({
          where: {
            organizationId,
            date: { lte: asOf },
            AND: [
              notDeletedAt,
              { OR: [{ refundedAt: null }, { refundedAt: later }] },
              { OR: [{ appliedToBillId: null }, { appliedToBill: { date: later } }] },
            ],
          },
          _sum: { amount: true },
        }),
        this.billsVoidedAfter(tx, organizationId, asOf, paymentInEffect),
        this.controlBalance(tx, organizationId, asOf),
      ]);

    const subledgerTotal = wide(open._sum.balanceDue)
      .add(wide(paidLater._sum.amount))
      .sub(wide(voidedLater._sum.amount))
      .sub(wide(prepaid._sum.amount))
      .add(wide(appliedLater._sum.amount))
      .sub(wide(unapplied._sum.amount))
      .add(voidedAfter);
    const difference = subledgerTotal.sub(control.balance);

    return {
      asOf: toIsoDate(asOf),
      currencyCode: control.currencyCode,
      subledgerTotal: subledgerTotal.toFixed(4),
      controlBalance: control.balance.toFixed(4),
      difference: difference.toFixed(4),
      ok: difference.isZero(),
    };
  }

  /** Reconstructs open payable for bills voided/deleted after cutoff whose approval journal was dated by asOf. */
  private async billsVoidedAfter(
    tx: Prisma.TransactionClient,
    organizationId: string,
    asOf: Date,
    paymentInEffect: Prisma.PaymentMadeWhereInput,
  ): Promise<Decimal> {
    const reversed = await tx.journal.findMany({
      where: {
        organizationId,
        isPosted: true,
        deletedAt: null,
        sourceType: JournalSourceType.BILL_APPROVAL,
        date: { lte: asOf },
        reversedBy: {
          is: { organizationId, isPosted: true, deletedAt: null, date: { gt: asOf } },
        },
      },
      select: { sourceId: true },
    });
    const ids = reversed.flatMap((j) => (j.sourceId ? [j.sourceId] : []));
    if (ids.length === 0) return new Wide(0);

    const gone: Prisma.BillWhereInput = {
      organizationId,
      id: { in: ids },
      OR: [{ deletedAt: { not: null } }, { status: { notIn: POSTED_BILL_STATUSES } }],
    };
    const [gross, paid, credited] = await Promise.all([
      tx.bill.aggregate({ where: gone, _sum: { grandTotal: true } }),
      tx.billAllocation.aggregate({
        where: { bill: gone, payment: paymentInEffect },
        _sum: { amount: true },
      }),
      tx.vendorCredit.aggregate({
        where: {
          organizationId,
          appliedToBill: gone,
          date: { lte: asOf },
          OR: [{ deletedAt: null }, { deletedAt: { gt: asOf } }],
        },
        _sum: { amount: true },
      }),
    ]);
    return wide(gross._sum.grandTotal).sub(wide(paid._sum.amount)).sub(wide(credited._sum.amount));
  }

  /** Credit-normal balance of the default AP account plus every account AP documents posted to. */
  private async controlBalance(
    tx: Prisma.TransactionClient,
    organizationId: string,
    asOf: Date,
  ): Promise<{ balance: Decimal; currencyCode: string }> {
    const apAccountFilter: Prisma.AccountWhereInput = {
      type: AccountType.LIABILITY,
      NOT: [
        { code: { startsWith: '22' } },
        { name: { contains: 'Tax', mode: 'insensitive' } },
        { name: { contains: 'VAT', mode: 'insensitive' } },
      ],
    };

    const [org, used, currencyCode] = await Promise.all([
      tx.organization.findUnique({
        where: { id: organizationId },
        select: { defaultApAccountId: true, defaultVatPayableAccountId: true },
      }),
      tx.journalLine.findMany({
        where: {
          journal: { organizationId, deletedAt: null },
          OR: [
            {
              credit: { gt: 0 },
              account: apAccountFilter,
              journal: { sourceType: JournalSourceType.BILL_APPROVAL },
            },
            {
              debit: { gt: 0 },
              account: apAccountFilter,
              journal: {
                sourceType: {
                  in: [JournalSourceType.PAYMENT_MADE, JournalSourceType.VENDOR_CREDIT],
                },
              },
            },
            // Legacy postings carry no source: find by document reference on liability accounts only.
            ...(['credit', 'debit'] as const).map((side) => ({
              [side]: { gt: 0 },
              account: apAccountFilter,
              journal: {
                sourceType: null,
                OR: LEGACY_AP_REFERENCES[side].map((prefix) => ({
                  reference: { startsWith: prefix },
                })),
              },
            })),
          ],
        },
        distinct: ['accountId'],
        select: { accountId: true },
      }),
      getBaseCurrency(tx as ReportPrisma, organizationId),
    ]);

    const accountIds = new Set(used.map((l) => l.accountId));
    if (org?.defaultApAccountId) accountIds.add(org.defaultApAccountId);
    if (org?.defaultVatPayableAccountId) accountIds.delete(org.defaultVatPayableAccountId);
    if (accountIds.size === 0) return { balance: new Wide(0), currencyCode };

    const totals = await sumPostedLinesByAccount(
      tx as ReportPrisma,
      organizationId,
      { lte: asOf },
      [...accountIds],
    );
    let balance: Decimal = new Wide(0);
    for (const t of totals.values()) balance = balance.add(wide(t.credit)).sub(wide(t.debit));
    return { balance, currencyCode };
  }
}
