import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  BillStatus,
  InvoiceStatus,
  Prisma,
  VATReturn,
  VATReturnStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
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

/** Approved bills (not drafts, not voided). */
const TAXABLE_BILL_STATUSES: BillStatus[] = [
  BillStatus.OPEN,
  BillStatus.PARTIALLY_PAID,
  BillStatus.PAID,
  BillStatus.OVERDUE,
];

/** Settlement and payment journals move VAT between accounts; they are not VAT activity. */
const VAT_SETTLEMENT_SOURCES: string[] = [
  JournalSourceType.VAT_RETURN,
  JournalSourceType.VAT_PAYMENT,
];

type Db = Prisma.TransactionClient;

export interface VatAccounts {
  /** Output VAT (collected on sales); also carries the net amount owed to the authority. */
  payableId: string;
  /** Input VAT (recoverable on purchases); also carries a refund due from the authority. */
  receivableId: string;
}

export interface VatFigures {
  totalSales: Decimal;
  outputVat: Decimal;
  totalPurchases: Decimal;
  inputVat: Decimal;
  netPayable: Decimal;
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

    const existing = await this.prisma.vATReturn.findFirst({
      where: { organizationId, period },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('VAT return for this period already exists');

    // A day covered by two returns would be declared (and settled) twice.
    const overlapping = await this.prisma.vATReturn.findFirst({
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

    try {
      return await this.prisma.$transaction(async (tx) => {
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

    // Guarded: a concurrent submit must not be overwritten by a recalculation.
    const { count } = await this.prisma.vATReturn.updateMany({
      where: {
        id,
        organizationId,
        deletedAt: null,
        status: { in: [VATReturnStatus.DRAFT, VATReturnStatus.CALCULATED] },
      },
      data: {
        totalSales: figures.totalSales,
        outputVAT: figures.outputVat,
        totalPurchases: figures.totalPurchases,
        inputVAT: figures.inputVat,
        netPayable: figures.netPayable,
        status: VATReturnStatus.CALCULATED,
      },
    });
    if (count === 0) {
      throw new ConflictException('VAT return changed while it was being calculated');
    }

    return this.prisma.vATReturn.findUniqueOrThrow({ where: { id } });
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

      const vatReturn = await tx.vATReturn.findUniqueOrThrow({ where: { id } });

      // The settlement must clear exactly what the return declares.
      const figures = await this.computeFigures(tx, organizationId, vatReturn, accounts);
      if (
        !figures.outputVat.equals(vatReturn.outputVAT) ||
        !figures.inputVat.equals(vatReturn.inputVAT)
      ) {
        throw new ConflictException(
          'VAT in the ledger changed since this return was calculated; recalculate it before submitting',
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

      return tx.vATReturn.findUniqueOrThrow({ where: { id }, include: { payment: true } });
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
      // Lock order: document row, then the organization ledger.
      await tx.$queryRaw`SELECT id FROM vat_returns WHERE id = ${vatReturnId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      await lockOrganizationLedger(tx, organizationId);
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

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { defaultVatPayableAccountId: true, baseCurrency: true },
      });
      if (!org?.defaultVatPayableAccountId) {
        throw new BadRequestException(
          'Please configure the default VAT Payable account in organization settings before recording VAT payments',
        );
      }
      const paidFrom = await tx.account.findFirst({
        where: {
          id: dto.paidFromAccountId,
          organizationId,
          deletedAt: null,
          isActive: true,
          type: AccountType.ASSET,
        },
        select: { id: true, currency: true },
      });
      if (!paidFrom) {
        throw new BadRequestException(
          'Paid-from account must be an active bank or cash asset account',
        );
      }
      if (paidFrom.currency.toUpperCase() !== org.baseCurrency.toUpperCase()) {
        throw new BadRequestException(
          `Paid-from account must be in the base currency ${org.baseCurrency}`,
        );
      }
      if (paidFrom.id === org.defaultVatPayableAccountId) {
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
              accountId: org.defaultVatPayableAccountId,
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

  bulkSubmit(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.submit(organizationId, id));
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
    return {
      payableId: org.defaultVatPayableAccountId,
      receivableId: org.defaultVatReceivableAccountId,
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
            OR: [{ sourceType: null }, { sourceType: { notIn: VAT_SETTLEMENT_SOURCES } }],
          },
        },
        _sum: { debit: true, credit: true },
      });
      return { debit: _sum.debit ?? ZERO, credit: _sum.credit ?? ZERO };
    };

    const [output, input, sales, purchases] = await Promise.all([
      movement(accounts.payableId),
      movement(accounts.receivableId),
      db.invoice.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: TAXABLE_INVOICE_STATUSES },
          date: window,
        },
        _sum: { subtotal: true },
      }),
      db.bill.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: TAXABLE_BILL_STATUSES },
          date: window,
        },
        _sum: { subtotal: true },
      }),
    ]);

    const outputVat = output.credit.sub(output.debit);
    const inputVat = input.debit.sub(input.credit);
    return {
      totalSales: sales._sum.subtotal ?? ZERO,
      outputVat,
      totalPurchases: purchases._sum.subtotal ?? ZERO,
      inputVat,
      netPayable: outputVat.sub(inputVat),
    };
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

    const { outputVat, inputVat, netPayable } = figures;
    push(accounts.payableId, outputVat, 'Output VAT cleared');
    push(accounts.receivableId, inputVat.neg(), 'Input VAT cleared');
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
