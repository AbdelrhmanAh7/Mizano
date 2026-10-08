import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { JournalSourceType } from '../../accounting/services/journals.service';
import {
  POSTED_BILL_STATUSES,
  endOfUtcDay,
  money,
  parseReportDate,
  sumPostedLinesByAccount,
  toDecimal,
  toIsoDate,
} from '../utils/report-utils';

export interface ApReconciliation {
  asOf: string;
  subledgerTotal: string;
  controlBalance: string;
  /** subledgerTotal − controlBalance. */
  difference: string;
  ok: boolean;
}

@Injectable()
export class ApReconciliationService {
  constructor(private prisma: ReadReplicaService) {}

  /**
   * Read-only check that the AP subledger ties to the AP control account as of a date (#125).
   *
   * Subledger: open balances of posted bills dated on or before `asOf` (DRAFT, PENDING, VOID and
   * deleted bills never count), less live unapplied vendor credits. The stored `balanceDue`
   * reflects every settlement up to now, so settlements dated after `asOf` (payments and applied
   * credits) are added back and payments voided after `asOf` are taken off again, which puts both
   * sides on the same date. Control: posted journal lines dated on or before `asOf` on every
   * account that carried AP (the default may have changed since a document was posted).
   */
  async reconcileApControl(organizationId: string, asOfDate?: string): Promise<ApReconciliation> {
    const asOf = parseReportDate(asOfDate, 'end', 'asOf') ?? endOfUtcDay(new Date());
    const later = { gt: asOf };
    const bill: Prisma.BillWhereInput = {
      organizationId,
      deletedAt: null,
      status: { in: POSTED_BILL_STATUSES },
      date: { lte: asOf },
    };

    const [open, paidLater, voidedLater, appliedLater, unapplied, controlBalance] =
      await Promise.all([
        this.prisma.bill.aggregate({ where: bill, _sum: { balanceDue: true } }),
        this.prisma.billAllocation.aggregate({
          where: { bill, payment: { organizationId, deletedAt: null, date: later } },
          _sum: { amount: true },
        }),
        this.prisma.billAllocation.aggregate({
          where: { bill, payment: { organizationId, date: { lte: asOf }, deletedAt: later } },
          _sum: { amount: true },
        }),
        this.prisma.vendorCredit.aggregate({
          where: { organizationId, deletedAt: null, date: later, appliedToBill: bill },
          _sum: { amount: true },
        }),
        // Unapplied as of `asOf`: not yet voided or refunded then, and not applied to a bill
        // that counts on that date.
        this.prisma.vendorCredit.aggregate({
          where: {
            organizationId,
            date: { lte: asOf },
            AND: [
              { OR: [{ deletedAt: null }, { deletedAt: later }] },
              { OR: [{ refundedAt: null }, { refundedAt: later }] },
              { OR: [{ appliedToBillId: null }, { appliedToBill: { date: later } }] },
            ],
          },
          _sum: { amount: true },
        }),
        this.controlBalance(organizationId, asOf),
      ]);

    const subledgerTotal = toDecimal(open._sum.balanceDue)
      .add(toDecimal(paidLater._sum.amount))
      .sub(toDecimal(voidedLater._sum.amount))
      .add(toDecimal(appliedLater._sum.amount))
      .sub(toDecimal(unapplied._sum.amount));
    const difference = subledgerTotal.sub(controlBalance);

    return {
      asOf: toIsoDate(asOf),
      subledgerTotal: money(subledgerTotal),
      controlBalance: money(controlBalance),
      difference: money(difference),
      ok: difference.isZero(),
    };
  }

  /** Credit-normal balance of the default AP account plus every account AP documents posted to. */
  private async controlBalance(organizationId: string, asOf: Date): Promise<Decimal> {
    const [org, used] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultApAccountId: true },
      }),
      this.prisma.journalLine.findMany({
        where: {
          journal: { organizationId, deletedAt: null },
          OR: [
            { credit: { gt: 0 }, journal: { sourceType: JournalSourceType.BILL_APPROVAL } },
            {
              debit: { gt: 0 },
              journal: {
                sourceType: {
                  in: [JournalSourceType.PAYMENT_MADE, JournalSourceType.VENDOR_CREDIT],
                },
              },
            },
          ],
        },
        distinct: ['accountId'],
        select: { accountId: true },
      }),
    ]);

    const accountIds = new Set(used.map((l) => l.accountId));
    if (org?.defaultApAccountId) accountIds.add(org.defaultApAccountId);
    if (accountIds.size === 0) return new Decimal(0);

    const totals = await sumPostedLinesByAccount(this.prisma, organizationId, { lte: asOf }, [
      ...accountIds,
    ]);
    let balance = new Decimal(0);
    for (const t of totals.values()) balance = balance.add(t.credit).sub(t.debit);
    return balance;
  }
}
