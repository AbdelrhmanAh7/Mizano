import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMode, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { CreatePaymentMadeDto } from '../dto/create-payment-made.dto';
import { PaymentMadeQueryDto } from '../dto/payment-made-query.dto';
import { BillsService, PAYABLE_BILL_STATUSES } from './bills.service';

export interface PayInFullOptions {
  paidFromAccountId?: string;
  date?: string;
  paymentMode?: PaymentMode;
}

function parsePositive(value: string, field: string): Decimal {
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

@Injectable()
export class PaymentsMadeService {
  constructor(
    private prisma: PrismaService,
    private billsService: BillsService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Records a vendor payment: allocations, bill balances and the Dr AP / Cr bank journal
   * commit in one transaction. Bills are row-locked so concurrent payments cannot overpay.
   */
  async create(
    organizationId: string,
    dto: CreatePaymentMadeDto,
    options: { tx?: Prisma.TransactionClient } = {},
  ) {
    const amount = parsePositive(dto.amount, 'amount');
    const allocations = dto.allocations.map((a, i) => ({
      billId: a.billId,
      amount: parsePositive(a.amount, `allocations[${i}].amount`),
    }));
    const billIds = allocations.map((a) => a.billId);
    if (new Set(billIds).size !== billIds.length) {
      throw new BadRequestException('Each bill can only be allocated once per payment');
    }
    const allocated = allocations.reduce((s, a) => s.add(a.amount), new Decimal(0));
    if (!allocated.equals(amount)) {
      throw new BadRequestException('Allocation must equal payment');
    }

    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid payment date');

    const run = async (tx: Prisma.TransactionClient) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: dto.vendorId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!vendor) throw new BadRequestException('Vendor not found');

      const paidFrom = await tx.account.findFirst({
        where: { id: dto.paidFromAccountId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!paidFrom) throw new BadRequestException('Paid-from account not found');

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { defaultApAccountId: true },
      });
      if (!org?.defaultApAccountId) {
        throw new BadRequestException(
          'Please configure default Accounts Payable account in organization settings before recording payments',
        );
      }

      await this.billsService.lockBills(tx, billIds);
      const bills = await tx.bill.findMany({
        where: { id: { in: billIds }, organizationId, deletedAt: null },
      });
      for (const alloc of allocations) {
        const bill = bills.find((b) => b.id === alloc.billId);
        if (!bill) throw new BadRequestException('Bill not found');
        if (bill.vendorId !== dto.vendorId) {
          throw new BadRequestException(`Bill ${bill.billNumber} belongs to a different vendor`);
        }
        if (!PAYABLE_BILL_STATUSES.includes(bill.status)) {
          throw new BadRequestException(`Bill ${bill.billNumber} is not open for payment`);
        }
        if (alloc.amount.greaterThan(bill.balanceDue)) {
          throw new BadRequestException(
            `Allocation exceeds the balance due on bill ${bill.billNumber}`,
          );
        }
      }

      const paymentNumber = await this.nextPaymentNumber(tx, organizationId);
      const payment = await tx.paymentMade.create({
        data: {
          paymentNumber,
          vendorId: dto.vendorId,
          date,
          amount,
          paymentMode: dto.paymentMode,
          paidFromAccountId: dto.paidFromAccountId,
          reference: dto.reference,
          notes: dto.notes,
          organizationId,
          allocations: {
            create: allocations.map((a) => ({ billId: a.billId, amount: a.amount })),
          },
        },
        include: { vendor: { select: { id: true, name: true } }, allocations: true },
      });

      for (const billId of billIds) {
        await this.billsService.recalculateBalance(tx, billId);
      }

      await this.journalsService.create(
        organizationId,
        {
          date: date.toISOString(),
          reference: `Payment ${paymentNumber}`,
          notes: `Vendor payment ${paymentNumber}`,
          lines: [
            {
              accountId: org.defaultApAccountId,
              debit: amount.toFixed(4),
              credit: '0',
              description: `${paymentNumber} - Accounts Payable`,
            },
            {
              accountId: dto.paidFromAccountId,
              debit: '0',
              credit: amount.toFixed(4),
              description: `${paymentNumber} - Payment`,
            },
          ],
        },
        { tx, source: { type: JournalSourceType.PAYMENT_MADE, id: payment.id } },
      );

      return payment;
    };

    return options.tx ? run(options.tx) : this.prisma.$transaction(run);
  }

  /** Pays the full remaining balance of one bill (used by bulk pay). */
  async payBillInFull(organizationId: string, billId: string, options: PayInFullOptions = {}) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, deletedAt: null },
      select: { id: true, vendorId: true, balanceDue: true, status: true, billNumber: true },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (!PAYABLE_BILL_STATUSES.includes(bill.status) || bill.balanceDue.lessThanOrEqualTo(0)) {
      throw new BadRequestException(`Bill ${bill.billNumber} is not open for payment`);
    }

    let paidFromAccountId = options.paidFromAccountId;
    if (!paidFromAccountId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultBankAccountId: true, defaultCashAccountId: true },
      });
      paidFromAccountId = org?.defaultBankAccountId ?? org?.defaultCashAccountId ?? undefined;
    }
    if (!paidFromAccountId) {
      throw new BadRequestException(
        'Choose a paid-from account or configure a default bank account in organization settings',
      );
    }

    const amount = bill.balanceDue.toFixed(4);
    return this.create(organizationId, {
      vendorId: bill.vendorId,
      date: options.date ?? new Date().toISOString(),
      amount,
      paymentMode: options.paymentMode ?? PaymentMode.BANK_TRANSFER,
      paidFromAccountId,
      allocations: [{ billId: bill.id, amount }],
    });
  }

  bulkPayBills(
    organizationId: string,
    billIds: string[],
    options: PayInFullOptions = {},
  ): Promise<BulkResultDto> {
    return runBulk(billIds, (id) => this.payBillInFull(organizationId, id, options));
  }

  /**
   * Voids a payment: soft-deletes it, restores bill balances from the remaining allocations
   * and posts a linked reversal of its journal. History is never rewritten.
   */
  async void(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.paymentMade.findFirst({
        where: { id, organizationId, deletedAt: null },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundException('Payment not found');

      const billIds = payment.allocations.map((a) => a.billId);
      await this.billsService.lockBills(tx, billIds);

      const { count } = await tx.paymentMade.updateMany({
        where: { id, organizationId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('Payment not found');

      for (const billId of billIds) {
        await this.billsService.recalculateBalance(tx, billId);
      }

      const journal = await tx.journal.findFirst({
        where: {
          organizationId,
          sourceType: JournalSourceType.PAYMENT_MADE,
          sourceId: id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!journal) {
        // Legacy payments (created before journals were source-linked) cannot be voided safely:
        // restoring the bill without reversing Dr AP / Cr bank would unbalance the ledger.
        throw new BadRequestException(
          'This payment has no linked ledger entry; reverse its journal manually before voiding',
        );
      }
      await this.journalsService.reverse(organizationId, journal.id, undefined, {
        tx,
        source: { type: JournalSourceType.PAYMENT_MADE_VOID, id },
      });

      return { message: 'Payment voided successfully' };
    });
  }

  async findAll(organizationId: string, query: PaymentMadeQueryDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc', vendorId } = query;
    const where: Prisma.PaymentMadeWhereInput = { organizationId, deletedAt: null };
    if (vendorId) where.vendorId = vendorId;
    const [payments, total] = await Promise.all([
      this.prisma.paymentMade.findMany({
        where,
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.paymentMade.count({ where }),
    ]);
    return { data: payments, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    return cursorPaginate(
      this.prisma.paymentMade,
      where,
      { [sortBy]: sortOrder },
      { cursor, take, include: { vendor: { select: { id: true, name: true } } } },
    );
  }

  /** Voided payments stay readable (with deletedAt set) so journal source links resolve. */
  async findOne(organizationId: string, id: string) {
    const payment = await this.prisma.paymentMade.findFirst({
      where: { id, organizationId },
      include: { vendor: true, allocations: { include: { bill: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.void(organizationId, id));
  }

  /** Serialized per organization so concurrent payments never collide on a number. */
  private async nextPaymentNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment-made:${organizationId}`}))`;
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING("paymentNumber" FROM '^VPMT-([0-9]+)$') AS INTEGER)) AS max
      FROM "payments_made" WHERE "organizationId" = ${organizationId}`;
    const last = Number(rows?.[0]?.max ?? 0);
    return `VPMT-${String(last + 1).padStart(3, '0')}`;
  }
}
