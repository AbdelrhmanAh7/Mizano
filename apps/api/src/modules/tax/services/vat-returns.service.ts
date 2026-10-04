import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillStatus, InvoiceStatus, Prisma, VATReturn, VATReturnStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { bankCashAccountWhere } from '../../../common/utils/bank-cash-accounts';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { LEGACY_OPENING_JOURNAL_NUMBER } from '../../accounting/services/opening-balances.service';
import { assertMoneyFits } from '../../sales/utils/sales-helpers';
import { CreateVatReturnDto } from '../dto/create-vat-return.dto';
import { RecordVatPaymentDto } from '../dto/record-vat-payment.dto';
import { VatReturnQueryDto } from '../dto/vat-return-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO = new Decimal(0);

/** Invoices that are VAT events: issued to the customer and not voided. */
const TAXABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
];

/** Approved bills for the current dashboard, not historical VAT return bases. */
const TAXABLE_BILL_STATUSES: BillStatus[] = [
  BillStatus.OPEN,
  BillStatus.PARTIALLY_PAID,
  BillStatus.PAID,
  BillStatus.OVERDUE,
];

/**
 * Settlement and payment journals move VAT between accounts, and opening balances (and their
 * reversals) restate balances; none of them is VAT activity of the period.
 */
const VAT_NON_ACTIVITY_SOURCES: string[] = [
  JournalSourceType.VAT_RETURN,
  JournalSourceType.VAT_PAYMENT,
  JournalSourceType.OPENING_BALANCE,
];

/** The legacy onboarding implementation posted its opening journal without a source type. */
const LEGACY_OPENING = { journalNumber: LEGACY_OPENING_JOURNAL_NUMBER, sourceType: null };

// Before source linking, bill approval still wrote this fixed reference and AP control line.
// Do not treat arbitrary source-less debits (including opening balances) as purchases.
const LEGACY_BILL_APPROVAL: Prisma.JournalWhereInput = {
  sourceType: null,
  reversalOfId: null,
  isPosted: true,
  deletedAt: null,
  reference: { startsWith: 'Bill ' },
  lines: {
    some: {
      credit: { gt: ZERO },
      description: { startsWith: 'Bill ', endsWith: '- Accounts Payable' },
    },
  },
};

// Before source linking, invoice send still wrote this fixed reference and Sales Revenue line.
// A source-less journal is a legacy invoice send only with that evidence; a manual journal whose
// line merely ends with "- Sales Revenue" must not inflate the sales base.
const LEGACY_INVOICE_SEND: Prisma.JournalWhereInput = {
  sourceType: null,
  reversalOfId: null,
  isPosted: true,
  deletedAt: null,
  reference: { startsWith: 'Invoice ' },
  lines: {
    some: {
      credit: { gt: ZERO },
      description: { startsWith: 'Invoice ', endsWith: '- Sales Revenue' },
    },
  },
};

type Db = Prisma.TransactionClient;

export interface VatAccounts {
  /** Output VAT (collected on sales); also carries the net amount owed to the authority. */
  payableId: string;
  /** Input VAT (recoverable on purchases); also carries a refund due from the authority. */
  receivableId: string;
  /** Every account that is or was an output-VAT account (includes payableId). */
  outputIds: string[];
  /** Every account that is or was an input-VAT account (includes receivableId). */
  inputIds: string[];
}

export interface VatFigures {
  totalSales: Decimal;
  outputVat: Decimal;
  totalPurchases: Decimal;
  inputVat: Decimal;
  netPayable: Decimal;
  /** Net credit movement per output account / net debit movement per input account. */
  outputByAccount: { accountId: string; amount: Decimal }[];
  inputByAccount: { accountId: string; amount: Decimal }[];
}

interface SettlementLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

/** Start of the UTC calendar day. */
function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} is not a valid date`);
  return date;
}

function parsePositiveAmount(value: string, field: string): Decimal {
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal number`);
  }
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new BadRequestException(`${field} must be greater than zero`);
  }
  return amount;
}

/** `2026-Q1` for a calendar quarter, `2026-03` for a calendar month, otherwise the exact range. */
export function derivePeriodLabel(start: Date, end: Date): string {
  const s = utcDay(start);
  const e = utcDay(end);
  const lastOfMonth = (year: number, month: number): number => Date.UTC(year, month + 1, 0);
  const year = s.getUTCFullYear();
  const month = s.getUTCMonth();
  if (s.getUTCDate() === 1) {
    if (e.getTime() === lastOfMonth(year, month)) {
      return `${year}-${String(month + 1).padStart(2, '0')}`;
    }
    if (month % 3 === 0 && e.getTime() === lastOfMonth(year, month + 2)) {
      return `${year}-Q${month / 3 + 1}`;
    }
  }
  return `${s.toISOString().slice(0, 10)}_${e.toISOString().slice(0, 10)}`;
}

@Injectable()
export class VatReturnsService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateVatReturnDto): Promise<VATReturn> {
    const startDate = utcDay(parseDate(dto.startDate, 'startDate'));
    const endDate = utcDay(parseDate(dto.endDate, 'endDate'));
    if (endDate < startDate) throw new BadRequestException('endDate must not be before startDate');
    const period = derivePeriodLabel(startDate, endDate);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Overlap check and insert happen under one per-organization lock (the same one that
        // serializes return numbering), so two concurrent creations cannot both pass the check.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vat-return:${organizationId}`}))`;

        const existing = await tx.vATReturn.findFirst({
          where: { organizationId, period },
          select: { id: true },
        });
        if (existing) throw new BadRequestException('VAT return for this period already exists');

        // A day covered by two returns would be declared (and settled) twice.
        const overlapping = await tx.vATReturn.findFirst({
          where: {
            organizationId,
            deletedAt: null,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
          select: { returnNumber: true, period: true },
        });
        if (overlapping) {
          throw new BadRequestException(
            `The period overlaps VAT return ${overlapping.returnNumber ?? overlapping.period}`,
          );
        }

        const returnNumber = await this.nextReturnNumber(tx, organizationId);
        return tx.vATReturn.create({
          data: {
            returnNumber,
            period,
            periodStart: startDate,
            periodEnd: endDate,
            startDate,
            endDate,
            status: VATReturnStatus.DRAFT,
            totalSales: ZERO,
            outputVAT: ZERO,
            totalPurchases: ZERO,
            inputVAT: ZERO,
            netPayable: ZERO,
            organizationId,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('VAT return for this period already exists');
      }
      throw error;
    }
  }

  /**
   * (Re)calculates a return from the posted ledger: output VAT is the net credit movement on the
   * VAT Payable account and input VAT the net debit movement on the VAT Receivable account in the
   * period. Settlement/payment journals are excluded so they never count as VAT activity.
   */
  async calculate(organizationId: string, id: string): Promise<VATReturn> {
    const vatReturn = await this.prisma.vATReturn.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!vatReturn) throw new NotFoundException('VAT return not found');
    if (
      vatReturn.status !== VATReturnStatus.DRAFT &&
      vatReturn.status !== VATReturnStatus.CALCULATED
    ) {
      throw new BadRequestException('Only draft or calculated VAT returns can be calculated');
    }

    const accounts = await this.resolveVatAccounts(this.prisma, organizationId);
    const figures = await this.computeFigures(this.prisma, organizationId, vatReturn, accounts);
    const totals = {
      totalSales: figures.totalSales,
      outputVAT: figures.outputVat,
      totalPurchases: figures.totalPurchases,
      inputVAT: figures.inputVat,
      netPayable: figures.netPayable,
    };
    for (const [field, amount] of Object.entries(totals)) assertMoneyFits(amount, field);

    // Guarded: a concurrent submit must not be overwritten by a recalculation.
    const { count } = await this.prisma.vATReturn.updateMany({
      where: {
        id,
        organizationId,
        deletedAt: null,
        status: { in: [VATReturnStatus.DRAFT, VATReturnStatus.CALCULATED] },
      },
      data: {
        ...totals,
        status: VATReturnStatus.CALCULATED,
      },
    });
    if (count === 0) {
      throw new ConflictException('VAT return changed while it was being calculated');
    }

    return this.prisma.vATReturn.findUniqueOrThrow({
      where: { id, organizationId, deletedAt: null },
    });
  }

  async findAll(organizationId: string, query: VatReturnQueryDto) {
    const where: Prisma.VATReturnWhereInput = { organizationId, deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.year) {
      where.startDate = {
        gte: new Date(Date.UTC(query.year, 0, 1)),
        lt: new Date(Date.UTC(query.year + 1, 0, 1)),
      };
    }

    return this.prisma.vATReturn.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: { payment: true },
    });
  }

  async findOne(organizationId: string, id: string) {
    const vatReturn = await this.prisma.vATReturn.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { payment: true },
    });
    if (!vatReturn) throw new NotFoundException('VAT return not found');
    return vatReturn;
  }

  /**
   * Submits a calculated return and posts the settlement journal in one transaction:
   *
   *   Dr VAT Payable    output VAT   (clear output VAT)
   *   Cr VAT Receivable input VAT    (clear input VAT)
   *   Cr VAT Payable    net          (net owed to the authority), or Dr VAT Receivable when refundable
   *
   * The journal is dated on the last day of the VAT period: the liability to the authority exists
   * as of period end and the VAT accounts read zero at period close. The period lock is applied
   * after the journal is posted, so an earlier lock covering period end is still honoured (and
   * rejects). Only one concurrent/retried submission can move CALCULATED -> SUBMITTED, so the
   * settlement posts exactly once.
   */
  async submit(organizationId: string, id: string): Promise<VATReturn> {
    return this.prisma.$transaction(async (tx) => {
      // Ledger lock first: no posting can land in the period between computing the figures
      // below and moving the lock date, so the settlement always matches the declared return.
      await lockOrganizationLedger(tx, organizationId);
      const existing = await tx.vATReturn.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { status: true },
      });
      if (!existing) throw new NotFoundException('VAT return not found');
      if (existing.status !== VATReturnStatus.CALCULATED) {
        throw new BadRequestException('VAT return must be calculated before submission');
      }

      const accounts = await this.resolveVatAccounts(tx, organizationId);

      // Guarded transition first: it row-locks the return, so a concurrent submit waits here and
      // then finds count === 0.
      const { count } = await tx.vATReturn.updateMany({
        where: { id, organizationId, deletedAt: null, status: VATReturnStatus.CALCULATED },
        data: { status: VATReturnStatus.SUBMITTED, submittedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('VAT return has already been submitted');

      const vatReturn = await tx.vATReturn.findUniqueOrThrow({
        where: { id, organizationId, deletedAt: null },
      });

      // The settlement must clear exactly what the return declares.
      const figures = await this.computeFigures(tx, organizationId, vatReturn, accounts);
      if (
        !figures.outputVat.equals(vatReturn.outputVAT) ||
        !figures.inputVat.equals(vatReturn.inputVAT) ||
        !figures.totalSales.equals(vatReturn.totalSales) ||
        !figures.totalPurchases.equals(vatReturn.totalPurchases)
      ) {
        // Bases are compared too: a zero-rated document moves totalSales/totalPurchases without
        // touching either VAT figure, and the submitted declaration must match the ledger.
        throw new ConflictException(
          'Ledger activity changed since this return was calculated (VAT or the sales/purchases base); recalculate it before submitting',
        );
      }

      const lines = this.buildSettlementLines(vatReturn, figures, accounts);
      const periodEnd = vatReturn.periodEnd ?? vatReturn.endDate;
      if (lines.length > 0) {
        await this.journalsService.create(
          organizationId,
          {
            date: periodEnd.toISOString(),
            reference: `VAT Return ${vatReturn.returnNumber ?? vatReturn.period}`,
            notes: `VAT settlement for ${vatReturn.period}`,
            lines,
          },
          { tx, source: { type: JournalSourceType.VAT_RETURN, id: vatReturn.id } },
        );
      }

      // Lock the period so the declared figures cannot change afterwards; never lowers the lock.
      await tx.organization.updateMany({
        where: { id: organizationId, OR: [{ lockDate: null }, { lockDate: { lt: periodEnd } }] },
        data: { lockDate: periodEnd },
      });

      return tx.vATReturn.findUniqueOrThrow({
        where: { id, organizationId, deletedAt: null },
        include: { payment: true },
      });
    });
  }

  /**
   * Records the payment of a submitted return: Dr VAT Payable / Cr bank, dated on the payment
   * date, in the same transaction as SUBMITTED -> FILED. The amount may not exceed the return's
   * net payable. (A return has one payment: VATPayment.vatReturnId is unique.)
   */
  async recordPayment(organizationId: string, vatReturnId: string, dto: RecordVatPaymentDto) {
    const amount = parsePositiveAmount(dto.amount, 'amount');
    const date = parseDate(dto.date, 'date');

    return this.prisma.$transaction(async (tx) => {
      // Lock order (same as submit): organization ledger, then the return row.
      await lockOrganizationLedger(tx, organizationId);
      await tx.$queryRaw`SELECT id FROM vat_returns WHERE id = ${vatReturnId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const vatReturn = await tx.vATReturn.findFirst({
        where: { id: vatReturnId, organizationId, deletedAt: null },
        include: { payment: true },
      });
      if (!vatReturn) throw new NotFoundException('VAT return not found');
      if (vatReturn.payment) {
        throw new BadRequestException('Payment already recorded for this VAT return');
      }
      if (vatReturn.status !== VATReturnStatus.SUBMITTED) {
        throw new BadRequestException('VAT return must be submitted before recording payment');
      }
      if (vatReturn.netPayable.lessThanOrEqualTo(0)) {
        throw new BadRequestException('This VAT return has no VAT payable to pay');
      }
      if (!amount.equals(vatReturn.netPayable)) {
        throw new BadRequestException(
          `Payment ${amount.toFixed(4)} must equal the VAT payable of ${vatReturn.netPayable.toFixed(4)} exactly; partial payments are not supported`,
        );
      }

      // Debit the VAT payable account this return's settlement actually credited (the default
      // may have changed since), read from the settlement journal itself.
      const settlement = await tx.journal.findFirst({
        where: {
          organizationId,
          sourceType: JournalSourceType.VAT_RETURN,
          sourceId: vatReturnId,
          deletedAt: null,
          isPosted: true,
        },
        select: { lines: { select: { accountId: true, credit: true, description: true } } },
      });
      const payableLine = settlement?.lines.find(
        (l) =>
          new Decimal(l.credit).greaterThan(0) &&
          (l.description ?? '').endsWith('- VAT payable to tax authority'),
      );
      if (!payableLine) {
        throw new ConflictException(
          'The settlement journal of this VAT return was not found; it cannot be paid',
        );
      }
      const payableAccountId = payableLine.accountId;

      // Only an eligible bank/cash account (same rule as sales refunds) can pay.
      const paidFrom = await tx.account.findFirst({
        where: {
          AND: [{ id: dto.paidFromAccountId }, await bankCashAccountWhere(tx, organizationId)],
        },
        select: { id: true },
      });
      if (!paidFrom) {
        throw new BadRequestException(
          'Paid-from account must be an active bank or cash account of this organization in the base currency',
        );
      }
      if (paidFrom.id === payableAccountId) {
        throw new BadRequestException('Paid-from account must differ from the VAT Payable account');
      }

      // Guarded transition: only one concurrent payment can move SUBMITTED -> FILED.
      const { count } = await tx.vATReturn.updateMany({
        where: {
          id: vatReturnId,
          organizationId,
          deletedAt: null,
          status: VATReturnStatus.SUBMITTED,
        },
        data: { status: VATReturnStatus.FILED, filedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('VAT return has already been paid');

      const payment = await tx.vATPayment.create({
        data: {
          vatReturnId,
          amount,
          date,
          paidFromAccountId: paidFrom.id,
          reference: dto.reference,
          organizationId,
        },
      });

      const label = vatReturn.returnNumber ?? vatReturn.period;
      await this.journalsService.create(
        organizationId,
        {
          date: date.toISOString(),
          reference: `VAT Payment ${label}`,
          notes: `VAT payment for return ${label}`,
          lines: [
            {
              accountId: payableAccountId,
              debit: amount.toFixed(4),
              credit: '0',
              description: `VAT Payment - ${label}`,
            },
            {
              accountId: paidFrom.id,
              debit: '0',
              credit: amount.toFixed(4),
              description: `VAT Payment - ${label} - Bank/Cash`,
            },
          ],
        },
        { tx, source: { type: JournalSourceType.VAT_PAYMENT, id: payment.id } },
      );

      return payment;
    });
  }

  /** Bank/cash accounts a VAT payment may be made from (the rule recordPayment enforces). */
  async paymentAccounts(
    organizationId: string,
  ): Promise<{ id: string; code: string; name: string }[]> {
    return this.prisma.account.findMany({
      where: await bankCashAccountWhere(this.prisma, organizationId),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Terminal state for a submitted return with nothing to pay (zero or refundable): SUBMITTED ->
   * FILED with a guarded update, no journal (the settlement already posted at submission). A
   * return with VAT payable is filed by recording its payment instead.
   */
  async fileReturn(organizationId: string, id: string): Promise<VATReturn> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      const { count } = await tx.vATReturn.updateMany({
        where: {
          id,
          organizationId,
          deletedAt: null,
          status: VATReturnStatus.SUBMITTED,
          netPayable: { lte: 0 },
        },
        data: { status: VATReturnStatus.FILED, filedAt: new Date() },
      });
      if (count === 0) {
        const current = await tx.vATReturn.findFirst({
          where: { id, organizationId, deletedAt: null },
          select: { status: true, netPayable: true },
        });
        if (!current) throw new NotFoundException('VAT return not found');
        if (current.status !== VATReturnStatus.SUBMITTED) {
          throw new BadRequestException('Only a submitted VAT return can be marked as filed');
        }
        throw new BadRequestException(
          'This VAT return has VAT payable; record its payment to file it',
        );
      }
      return tx.vATReturn.findUniqueOrThrow({
        where: { id, organizationId, deletedAt: null },
        include: { payment: true },
      });
    });
  }

  /** Live VAT position for any date range (not stored), as decimal strings. */
  async getVatSummary(organizationId: string, startDate: string, endDate: string) {
    const start = utcDay(parseDate(startDate, 'startDate'));
    const end = utcDay(parseDate(endDate, 'endDate'));
    if (end < start) throw new BadRequestException('endDate must not be before startDate');

    const accounts = await this.resolveVatAccounts(this.prisma, organizationId);
    const figures = await this.computeFigures(
      this.prisma,
      organizationId,
      { startDate: start, endDate: end },
      accounts,
    );
    const window = { gte: start, lt: new Date(end.getTime() + DAY_MS) };

    const [invoiceCount, billCount, expenseCount] = await Promise.all([
      this.prisma.invoice.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: TAXABLE_INVOICE_STATUSES },
          date: window,
        },
      }),
      this.prisma.bill.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: TAXABLE_BILL_STATUSES },
          date: window,
        },
      }),
      this.prisma.expense.count({ where: { organizationId, deletedAt: null, date: window } }),
    ]);

    return {
      period: { start: startDate, end: endDate },
      sales: {
        count: invoiceCount,
        total: figures.totalSales.toFixed(4),
        vatCollected: figures.outputVat.toFixed(4),
      },
      purchases: {
        billCount,
        expenseCount,
        totalPurchases: figures.totalPurchases.toFixed(4),
        vatPaid: figures.inputVat.toFixed(4),
      },
      netVAT: figures.netPayable.toFixed(4),
      vatPayable: Decimal.max(figures.netPayable, ZERO).toFixed(4),
      vatRefundable: Decimal.max(figures.netPayable.neg(), ZERO).toFixed(4),
    };
  }

  async getDashboardStats(organizationId: string) {
    const [taxRates, vatReturns, payments] = await Promise.all([
      this.prisma.taxRate.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, isActive: true },
      }),
      this.prisma.vATReturn.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true,
          status: true,
          outputVAT: true,
          inputVAT: true,
          netPayable: true,
          dueDate: true,
          startDate: true,
          endDate: true,
          returnNumber: true,
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.vATPayment.findMany({
        where: { organizationId },
        select: { amount: true },
      }),
    ]);

    const activeRates = taxRates.filter((r) => r.isActive).length;
    const pendingReturns = vatReturns.filter(
      (r) => r.status === VATReturnStatus.DRAFT || r.status === VATReturnStatus.CALCULATED,
    ).length;
    const outstandingVAT = vatReturns
      .filter((r) => r.status !== VATReturnStatus.FILED)
      .reduce((sum, r) => sum.add(r.netPayable), ZERO);
    const totalPaid = payments.reduce((sum, p) => sum.add(p.amount), ZERO);

    const now = new Date();
    const upcomingDeadlines = vatReturns
      .filter((r) => r.dueDate && r.status !== VATReturnStatus.FILED && r.dueDate > now)
      .slice(0, 5);

    return {
      activeRates,
      totalRates: taxRates.length,
      pendingReturns,
      totalReturns: vatReturns.length,
      outstandingVAT: outstandingVAT.toFixed(4),
      totalPaid: totalPaid.toFixed(4),
      upcomingDeadlines,
      recentReturns: vatReturns.slice(0, 5),
    };
  }

  /** Drafts and calculated (not yet submitted) returns have no ledger effect and can be deleted. */
  async deleteReturn(organizationId: string, id: string): Promise<{ message: string }> {
    const { count } = await this.prisma.vATReturn.updateMany({
      where: {
        id,
        organizationId,
        deletedAt: null,
        status: { in: [VATReturnStatus.DRAFT, VATReturnStatus.CALCULATED] },
      },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      await this.findOne(organizationId, id);
      throw new BadRequestException('Only draft or calculated VAT returns can be deleted');
    }
    return { message: 'VAT return deleted' };
  }

  // === Bulk Operations: same commands as the single-record routes ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.deleteReturn(organizationId, id));
  }

  async bulkSubmit(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    // Submitting locks the ledger up to the period end, so older periods must go first.
    const returns = await this.prisma.vATReturn.findMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      select: { id: true, periodEnd: true, endDate: true },
    });
    const end = (r: { periodEnd: Date | null; endDate: Date }): number =>
      (r.periodEnd ?? r.endDate).getTime();
    const known = new Set(returns.map((r) => r.id));
    // Ties (same period end) break on id so the order is deterministic; ids not found in this
    // organization run last and fail with the single-record 404.
    const ordered = [
      ...returns.sort((a, b) => end(a) - end(b) || a.id.localeCompare(b.id)).map((r) => r.id),
      ...ids.filter((id) => !known.has(id)),
    ];
    return runBulk(ordered, (id) => this.submit(organizationId, id));
  }

  // === Helpers ===

  /** The organization's output/input VAT accounts; both must exist in this tenant. */
  private async resolveVatAccounts(db: Db, organizationId: string): Promise<VatAccounts> {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { defaultVatPayableAccountId: true, defaultVatReceivableAccountId: true },
    });
    if (!org?.defaultVatPayableAccountId) {
      throw new BadRequestException(
        'Please configure the default VAT Payable account in organization settings before working with VAT returns',
      );
    }
    if (!org.defaultVatReceivableAccountId) {
      throw new BadRequestException(
        'Please configure the default VAT Receivable account in organization settings before working with VAT returns',
      );
    }
    if (org.defaultVatPayableAccountId === org.defaultVatReceivableAccountId) {
      throw new BadRequestException(
        'The VAT Payable and VAT Receivable accounts must be different accounts',
      );
    }
    const ids = [org.defaultVatPayableAccountId, org.defaultVatReceivableAccountId];
    const found = await db.account.count({
      where: { id: { in: ids }, organizationId, deletedAt: null },
    });
    if (found !== ids.length) {
      throw new BadRequestException(
        'The configured VAT Payable/Receivable accounts no longer exist; review organization settings',
      );
    }
    const payableId = org.defaultVatPayableAccountId;
    const receivableId = org.defaultVatReceivableAccountId;
    const history = await this.historicalVatAccounts(db, organizationId);
    const outputIds = [...new Set([payableId, ...history.output])].filter(
      (id) => id !== receivableId,
    );
    const inputIds = [...new Set([receivableId, ...history.input])].filter(
      (id) => !outputIds.includes(id),
    );
    return { payableId, receivableId, outputIds, inputIds };
  }

  /**
   * Accounts that carried VAT before the organization's defaults changed. Neither Account nor
   * TaxRate has an authoritative VAT marker (tax-rate account links are not used by posting),
   * so the marker is the posting itself: every VAT line is written with a fixed description
   * ("... - VAT Payable" by invoices and credit notes, "... - VAT Receivable" by bills, and the
   * "Output VAT cleared"/"Input VAT cleared" lines of VAT return settlements). Any account that
   * ever carried such a line in this organization still counts as a VAT account. Current
   * defaults always win when an account appears on both sides.
   */
  private async historicalVatAccounts(
    db: Db,
    organizationId: string,
  ): Promise<{ output: string[]; input: string[] }> {
    const sources = [
      JournalSourceType.INVOICE_SEND,
      JournalSourceType.BILL_APPROVAL,
      JournalSourceType.CREDIT_NOTE,
      JournalSourceType.EXPENSE,
      JournalSourceType.VENDOR_CREDIT,
      JournalSourceType.VAT_RETURN,
    ];
    const lines = (descriptions: string[]) =>
      db.journalLine.findMany({
        where: {
          OR: descriptions.map((d) => ({ description: { endsWith: d } })),
          // Source-less journals are legacy document postings (invoices, bills, credits and
          // expenses written before journals were source-linked; the source-link migration
          // backfilled nothing), identified by the same line markers.
          journal: {
            organizationId,
            deletedAt: null,
            isPosted: true,
            OR: [{ sourceType: { in: sources } }, { sourceType: null }],
          },
        },
        select: { accountId: true },
        distinct: ['accountId'],
      });
    const [output, input] = await Promise.all([
      lines(['- VAT Payable', '- Output VAT cleared']),
      lines(['- VAT Receivable', '- Input VAT cleared']),
    ]);
    return {
      output: (output ?? []).map((l) => l.accountId),
      input: (input ?? []).map((l) => l.accountId),
    };
  }

  private async computeFigures(
    db: Db,
    organizationId: string,
    range: { startDate: Date; endDate: Date },
    accounts: VatAccounts,
  ): Promise<VatFigures> {
    const start = utcDay(range.startDate);
    const endExclusive = new Date(utcDay(range.endDate).getTime() + DAY_MS);
    const window = { gte: start, lt: endExclusive };

    const movement = async (accountId: string): Promise<{ debit: Decimal; credit: Decimal }> => {
      const { _sum } = await db.journalLine.aggregate({
        where: {
          accountId,
          journal: {
            organizationId,
            isPosted: true,
            deletedAt: null,
            date: window,
            AND: [
              { OR: [{ sourceType: null }, { sourceType: { notIn: VAT_NON_ACTIVITY_SOURCES } }] },
              { NOT: LEGACY_OPENING },
              { NOT: { reversalOf: { is: LEGACY_OPENING } } },
            ],
          },
        },
        _sum: { debit: true, credit: true },
      });
      return { debit: _sum.debit ?? ZERO, credit: _sum.credit ?? ZERO };
    };

    const [output, input, sales, shipping, creditedNet, purchases] = await Promise.all([
      Promise.all(accounts.outputIds.map(movement)),
      Promise.all(accounts.inputIds.map(movement)),
      // Sales are the dated Sales Revenue lines of invoice issue and void journals, so an invoice
      // voided in a later period keeps its base in the original period (like its VAT credit)
      // and the reversal lowers the base of the period the void is dated in. Source-less
      // journals count only as legacy invoice sends (written before journals were source-linked,
      // evidenced by their Invoice reference and revenue line) and the linked reversals of
      // those, which lower the base on their own date like the VAT credit they carry.
      db.journalLine.aggregate({
        where: {
          description: { endsWith: '- Sales Revenue' },
          journal: {
            organizationId,
            isPosted: true,
            deletedAt: null,
            date: window,
            OR: [
              {
                sourceType: {
                  in: [JournalSourceType.INVOICE_SEND, JournalSourceType.INVOICE_VOID],
                },
              },
              LEGACY_INVOICE_SEND,
              {
                sourceType: null,
                reversalOf: { is: { ...LEGACY_INVOICE_SEND, organizationId } },
              },
            ],
          },
        },
        _sum: { debit: true, credit: true },
      }),
      this.invoiceShippingInWindow(db, organizationId, window),
      // Credit notes (and their voids) in the period, net of VAT: the Sales Returns lines of the
      // same posted journals that carry the VAT, so the base matches the output VAT.
      db.journalLine.aggregate({
        where: {
          description: { endsWith: '- Sales Returns' },
          journal: {
            organizationId,
            isPosted: true,
            deletedAt: null,
            date: window,
            sourceType: { in: [JournalSourceType.CREDIT_NOTE, JournalSourceType.CREDIT_NOTE_VOID] },
          },
        },
        _sum: { debit: true, credit: true },
      }),
      // The base-side lines of each posting (and its reversal), excluding historical input
      // VAT accounts. Direction identifies the base without trusting editable line labels.
      db.journalLine.aggregate({
        where: {
          accountId: { notIn: accounts.inputIds },
          journal: {
            organizationId,
            isPosted: true,
            deletedAt: null,
            date: window,
          },
          OR: [
            {
              journal: {
                sourceType: { in: [JournalSourceType.BILL_APPROVAL, JournalSourceType.EXPENSE] },
              },
              debit: { gt: ZERO },
            },
            {
              journal: { sourceType: { in: ['BILL_VOID', JournalSourceType.EXPENSE_VOID] } },
              credit: { gt: ZERO },
            },
            {
              journal: { sourceType: JournalSourceType.VENDOR_CREDIT },
              credit: { gt: ZERO },
            },
            {
              journal: { sourceType: JournalSourceType.VENDOR_CREDIT_VOID },
              debit: { gt: ZERO },
            },
            { journal: LEGACY_BILL_APPROVAL, debit: { gt: ZERO } },
            {
              journal: {
                sourceType: null,
                reversalOf: { is: { ...LEGACY_BILL_APPROVAL, organizationId } },
              },
              credit: { gt: ZERO },
            },
          ],
        },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const outputByAccount = accounts.outputIds.map((accountId, i) => ({
      accountId,
      amount: output[i].credit.sub(output[i].debit),
    }));
    const inputByAccount = accounts.inputIds.map((accountId, i) => ({
      accountId,
      amount: input[i].debit.sub(input[i].credit),
    }));
    const outputVat = outputByAccount.reduce((sum, x) => sum.add(x.amount), ZERO);
    const inputVat = inputByAccount.reduce((sum, x) => sum.add(x.amount), ZERO);
    return {
      outputByAccount,
      inputByAccount,
      totalSales: (sales._sum.credit ?? ZERO)
        .sub(sales._sum.debit ?? ZERO)
        .sub(shipping)
        .sub(creditedNet._sum.debit ?? ZERO)
        .add(creditedNet._sum.credit ?? ZERO),
      outputVat,
      totalPurchases: (purchases._sum.debit ?? ZERO).sub(purchases._sum.credit ?? ZERO),
      inputVat,
      netPayable: outputVat.sub(inputVat),
    };
  }

  /**
   * Shipping charged on the invoices issued (minus those voided) in the window, dated on the
   * same INVOICE_SEND / INVOICE_VOID journals as the sales base. Shipping carries no VAT
   * (`computeDocumentTotals`: grandTotal = subtotal + tax + shipping, tax is per line), so it is
   * not part of the taxable base the return pairs with output VAT; the Sales Revenue line is
   * subtotal + shipping, so the shipping share is taken back out here. Legacy source-less sends
   * cannot be mapped to their invoice, so their shipping stays in the base.
   */
  private async invoiceShippingInWindow(
    db: Db,
    organizationId: string,
    window: { gte: Date; lt: Date },
  ): Promise<Decimal> {
    const events = await db.journal.findMany({
      where: {
        organizationId,
        isPosted: true,
        deletedAt: null,
        date: window,
        OR: [
          { sourceType: { in: [JournalSourceType.INVOICE_SEND, JournalSourceType.INVOICE_VOID] } },
          LEGACY_INVOICE_SEND,
          {
            sourceType: null,
            reversalOf: { is: { ...LEGACY_INVOICE_SEND, organizationId } },
          },
        ],
      },
      select: {
        sourceType: true,
        sourceId: true,
        reference: true,
        reversalOfId: true,
        reversalOf: { select: { reference: true } },
      },
    });

    const idsOf = (type: string): string[] =>
      events.flatMap((e) => (e.sourceType === type && e.sourceId ? [e.sourceId] : []));

    const legacyNumbersOf = (isVoid: boolean): string[] =>
      events.flatMap((e) => {
        if (e.sourceType !== null) return [];
        const isCurrentlyVoid = !!e.reversalOfId;
        if (isCurrentlyVoid !== isVoid) return [];
        const ref = isVoid ? e.reversalOf?.reference : e.reference;
        if (!ref || !ref.startsWith('Invoice ')) return [];
        return [ref.slice(8)];
      });

    const shippingOfIds = async (ids: string[]): Promise<Decimal> => {
      if (ids.length === 0) return ZERO;
      const { _sum } = await db.invoice.aggregate({
        where: { organizationId, id: { in: ids } },
        _sum: { shippingAmount: true },
      });
      return _sum.shippingAmount ?? ZERO;
    };

    const shippingOfNumbers = async (numbers: string[]): Promise<Decimal> => {
      if (numbers.length === 0) return ZERO;
      const invoices = await db.invoice.findMany({
        where: { organizationId, invoiceNumber: { in: numbers } },
        select: { invoiceNumber: true, shippingAmount: true },
      });

      const foundNumbers = new Set(invoices.map((i) => i.invoiceNumber));
      const missing = numbers.filter((n) => !foundNumbers.has(n));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Cannot compute VAT: missing legacy invoices ${missing.join(', ')}`,
        );
      }
      return invoices.reduce((sum, inv) => sum.add(inv.shippingAmount ?? ZERO), ZERO);
    };

    const [sent, voided, legacySent, legacyVoided] = await Promise.all([
      shippingOfIds(idsOf(JournalSourceType.INVOICE_SEND)),
      shippingOfIds(idsOf(JournalSourceType.INVOICE_VOID)),
      shippingOfNumbers(legacyNumbersOf(false)),
      shippingOfNumbers(legacyNumbersOf(true)),
    ]);
    return sent.add(legacySent).sub(voided).sub(legacyVoided);
  }

  /** Balanced by construction: output closing - input closing - net = 0 for any signs. */
  private buildSettlementLines(
    vatReturn: Pick<VATReturn, 'returnNumber' | 'period'>,
    figures: VatFigures,
    accounts: VatAccounts,
  ): SettlementLine[] {
    const label = vatReturn.returnNumber ?? vatReturn.period;
    const lines: SettlementLine[] = [];
    const push = (accountId: string, signedDebit: Decimal, description: string): void => {
      if (signedDebit.isZero()) return;
      lines.push({
        accountId,
        debit: signedDebit.greaterThan(0) ? signedDebit.toFixed(4) : '0',
        credit: signedDebit.lessThan(0) ? signedDebit.abs().toFixed(4) : '0',
        description: `${label} - ${description}`,
      });
    };

    const { netPayable } = figures;
    for (const x of figures.outputByAccount) push(x.accountId, x.amount, 'Output VAT cleared');
    for (const x of figures.inputByAccount) push(x.accountId, x.amount.neg(), 'Input VAT cleared');
    if (netPayable.greaterThan(0)) {
      push(accounts.payableId, netPayable.neg(), 'VAT payable to tax authority');
    } else {
      push(accounts.receivableId, netPayable.neg(), 'VAT refundable from tax authority');
    }
    return lines;
  }

  /** Serialized per organization so concurrent creations never share a number. */
  private async nextReturnNumber(tx: Db, organizationId: string): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vat-return:${organizationId}`}))`;
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING("returnNumber" FROM '^VAT-([0-9]+)$') AS INTEGER)) AS max
      FROM "vat_returns" WHERE "organizationId" = ${organizationId}`;
    const last = Number(rows?.[0]?.max ?? 0);
    return `VAT-${String(last + 1).padStart(3, '0')}`;
  }
}
