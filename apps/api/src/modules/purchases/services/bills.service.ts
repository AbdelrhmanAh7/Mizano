import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { computeDocumentTotals } from '../../../common/utils/document-totals';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { BillCursorQueryDto } from '../dto/bill-cursor-query.dto';
import { BillQueryDto } from '../dto/bill-query.dto';
import { BillLineDto, CreateBillDto } from '../dto/create-bill.dto';
import { UpdateBillDto } from '../dto/update-bill.dto';

/** Bill statuses that carry an open AP balance and can receive payments. */
export const PAYABLE_BILL_STATUSES: BillStatus[] = [
  BillStatus.OPEN,
  BillStatus.PARTIALLY_PAID,
  BillStatus.OVERDUE,
];

@Injectable()
export class BillsService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateBillDto) {
    await this.assertReferences(this.prisma, organizationId, dto);
    const { lineData, totals } = this.buildLines(dto.lines);

    try {
      const billNumber = dto.billNumber?.trim() || (await this.nextBillNumber(organizationId));
      return await this.prisma.bill.create({
        data: {
          billNumber,
          vendorId: dto.vendorId,
          date: new Date(dto.date),
          dueDate: new Date(dto.dueDate),
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          balanceDue: totals.grandTotal,
          reference: dto.reference,
          currencyCode: dto.currencyCode,
          notes: dto.notes,
          projectId: dto.projectId,
          organizationId,
          lines: { create: lineData },
        },
        include: { vendor: { select: { id: true, name: true } }, lines: true },
      });
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async findAll(organizationId: string, query: BillQueryDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where: Prisma.BillWhereInput = { organizationId, deletedAt: null };

    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.status) {
      const statuses = query.status.split(',').map((s) => s.trim()) as BillStatus[];
      where.status = { in: statuses };
    }
    if (query.hasBalance) where.balanceDue = { gt: new Decimal(0) };

    const [bills, total] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bill.count({ where }),
    ]);
    return { data: bills, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: BillCursorQueryDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;
    const where: Prisma.BillWhereInput = { organizationId, deletedAt: null };

    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.status) {
      const statuses = query.status.split(',').map((s) => s.trim()) as BillStatus[];
      where.status = { in: statuses };
    }
    if (query.hasBalance) where.balanceDue = { gt: new Decimal(0) };
    if (query.startDate || query.endDate) {
      where.date = {
        ...(query.startDate && { gte: new Date(query.startDate) }),
        ...(query.endDate && { lte: new Date(query.endDate) }),
      };
    }

    return cursorPaginate(
      this.prisma.bill,
      where,
      { [sortBy]: sortOrder },
      { cursor, take, include: { vendor: { select: { id: true, name: true } } } },
    );
  }

  async findOne(organizationId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        vendor: true,
        lines: true,
        // Each allocation carries its payment so clients don't need a separate (paged) lookup.
        billAllocations: {
          include: {
            payment: { select: { id: true, paymentNumber: true, date: true, deletedAt: true } },
          },
        },
      },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  /** Draft bills only. When lines are supplied they replace the old lines and totals. */
  async update(organizationId: string, id: string, dto: UpdateBillDto) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException('Only draft bills can be updated');
    }

    await this.assertReferences(this.prisma, organizationId, dto);

    const data: Prisma.BillUpdateInput = {};
    if (dto.billNumber !== undefined) data.billNumber = dto.billNumber;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dto.reference !== undefined) data.reference = dto.reference;
    if (dto.currencyCode !== undefined) data.currencyCode = dto.currencyCode;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.vendorId !== undefined) data.vendor = { connect: { id: dto.vendorId } };
    if (dto.projectId !== undefined) data.project = { connect: { id: dto.projectId } };

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.lines) {
          const { lineData, totals } = this.buildLines(dto.lines);
          await tx.billLine.deleteMany({ where: { billId: id } });
          data.lines = { create: lineData };
          data.subtotal = totals.subtotal;
          data.taxAmount = totals.taxAmount;
          data.grandTotal = totals.grandTotal;
          data.balanceDue = totals.grandTotal;
        }
        // Guarded: the bill must still be a draft when the write lands.
        const { count } = await tx.bill.updateMany({
          where: { id, organizationId, status: BillStatus.DRAFT, deletedAt: null },
          data: { updatedAt: new Date() },
        });
        if (count === 0) throw new ConflictException('Bill was approved concurrently');
        return tx.bill.update({
          where: { id },
          data,
          include: { vendor: { select: { id: true, name: true } }, lines: true },
        });
      });
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /**
   * Recalculates balance and status from live (non-deleted) payment allocations.
   * Must run inside the caller's transaction after the bill row is locked.
   */
  async recalculateBalance(tx: Prisma.TransactionClient, billId: string): Promise<void> {
    const bill = await tx.bill.findUnique({ where: { id: billId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found for balance update`);

    const allocations = await tx.billAllocation.findMany({
      where: { billId, payment: { deletedAt: null } },
      select: { amount: true },
    });
    const paid = allocations.reduce((s, a) => s.add(a.amount), new Decimal(0));
    const balance = Decimal.max(bill.grandTotal.sub(paid), new Decimal(0));

    let status = bill.status;
    if (balance.isZero()) status = BillStatus.PAID;
    else if (paid.greaterThan(0)) status = BillStatus.PARTIALLY_PAID;
    else if (bill.dueDate < new Date()) status = BillStatus.OVERDUE;
    else status = BillStatus.OPEN;

    await tx.bill.update({ where: { id: billId }, data: { balanceDue: balance, status } });
  }

  /** Row-locks bills (sorted to avoid deadlocks) for the rest of the transaction. */
  async lockBills(tx: Prisma.TransactionClient, billIds: string[]): Promise<void> {
    for (const id of [...new Set(billIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM "bills" WHERE id = ${id} FOR UPDATE`;
    }
  }

  async checkDuplicate(
    organizationId: string,
    dto: { vendorId: string; billNumber?: string; amount?: number | string; date?: string },
  ): Promise<{
    isDuplicate: boolean;
    existingBillId: string | null;
    similarity: number;
    matchType: 'exact_number' | 'amount_date' | 'none';
  }> {
    if (dto.billNumber) {
      const exactMatch = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId: dto.vendorId,
          billNumber: dto.billNumber,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (exactMatch) {
        return {
          isDuplicate: true,
          existingBillId: exactMatch.id,
          similarity: 1.0,
          matchType: 'exact_number',
        };
      }
    }

    // Same vendor, amount within ±1%, date within ±3 days.
    if (dto.amount && dto.date) {
      const amount = new Decimal(dto.amount);
      const targetDate = new Date(dto.date);
      const dateFrom = new Date(targetDate);
      dateFrom.setDate(dateFrom.getDate() - 3);
      const dateTo = new Date(targetDate);
      dateTo.setDate(dateTo.getDate() + 3);
      const variance = amount.mul('0.01');

      const amountMatch = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId: dto.vendorId,
          deletedAt: null,
          grandTotal: { gte: amount.sub(variance), lte: amount.add(variance) },
          date: { gte: dateFrom, lte: dateTo },
        },
        select: { id: true },
      });
      if (amountMatch) {
        return {
          isDuplicate: true,
          existingBillId: amountMatch.id,
          similarity: 0.9,
          matchType: 'amount_date',
        };
      }
    }

    return { isDuplicate: false, existingBillId: null, similarity: 0, matchType: 'none' };
  }

  /** "Open" is the same accounting event as approval: it must post to the ledger. */
  async open(organizationId: string, id: string) {
    return { data: await this.approve(organizationId, id) };
  }

  /**
   * Approves a draft bill and posts Dr expenses / Dr VAT receivable / Cr AP, dated on the bill
   * date. State change and journal commit together; concurrent or retried approvals post once.
   */
  async approve(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock first: the currency/account checks below must see the same organization settings
      // the journal is posted under (a base-currency change takes this lock too).
      await lockOrganizationLedger(tx, organizationId);
      const bill = await tx.bill.findFirst({
        where: { id, organizationId, deletedAt: null },
        include: { lines: true },
      });
      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.status !== BillStatus.DRAFT) {
        throw new BadRequestException('Only draft bills can be approved');
      }
      if (bill.lines.length === 0) throw new BadRequestException('Bill has no lines');
      if (bill.lines.some((l) => !l.accountId)) {
        throw new BadRequestException(
          'All bill lines must have an expense account assigned before approval',
        );
      }

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          defaultApAccountId: true,
          defaultVatReceivableAccountId: true,
          baseCurrency: true,
        },
      });
      // The ledger is single-currency: never post foreign amounts as if they were base currency.
      const billCurrency = bill.currencyCode?.trim().toUpperCase();
      if (billCurrency && org && billCurrency !== org.baseCurrency.toUpperCase()) {
        throw new BadRequestException(
          `Bill currency ${billCurrency} differs from the base currency ${org.baseCurrency}; foreign-currency bills cannot be posted yet`,
        );
      }
      if (!org?.defaultApAccountId) {
        throw new BadRequestException(
          'Please configure default Accounts Payable account in organization settings before approving bills',
        );
      }
      if (bill.taxAmount.greaterThan(0) && !org.defaultVatReceivableAccountId) {
        throw new BadRequestException(
          'Please configure default VAT Receivable account in organization settings before approving taxed bills',
        );
      }

      // Guarded transition: only one concurrent approval can move DRAFT -> OPEN.
      const { count } = await tx.bill.updateMany({
        where: { id, organizationId, status: BillStatus.DRAFT, deletedAt: null },
        data: { status: BillStatus.OPEN },
      });
      if (count === 0) throw new ConflictException('Bill has already been approved');

      const journalLines = bill.lines
        .filter((line) => line.amount.greaterThan(0))
        .map((line) => ({
          accountId: line.accountId as string,
          debit: line.amount.toFixed(4),
          credit: '0',
          description: `Bill ${bill.billNumber} - ${line.description || 'Expense'}`,
        }));
      if (bill.taxAmount.greaterThan(0)) {
        journalLines.push({
          accountId: org.defaultVatReceivableAccountId as string,
          debit: bill.taxAmount.toFixed(4),
          credit: '0',
          description: `Bill ${bill.billNumber} - VAT Receivable`,
        });
      }
      journalLines.push({
        accountId: org.defaultApAccountId,
        debit: '0',
        credit: bill.grandTotal.toFixed(4),
        description: `Bill ${bill.billNumber} - Accounts Payable`,
      });

      await this.journalsService.create(
        organizationId,
        {
          date: bill.date.toISOString(),
          reference: `Bill ${bill.billNumber}`,
          notes: `Accounting entry for bill ${bill.billNumber}`,
          lines: journalLines,
        },
        { tx, source: { type: JournalSourceType.BILL_APPROVAL, id: bill.id } },
      );

      return tx.bill.findUniqueOrThrow({
        where: { id },
        include: { vendor: { select: { id: true, name: true } }, lines: true },
      });
    });
  }

  async clone(organizationId: string, id: string) {
    const original = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { lines: true },
    });
    if (!original) throw new NotFoundException('Bill not found');

    // A copy needs a number not yet used for this vendor.
    const base = `${original.billNumber}-COPY`;
    const copies = await this.prisma.bill.count({
      where: { organizationId, vendorId: original.vendorId, billNumber: { startsWith: base } },
    });
    const billNumber = copies === 0 ? base : `${base}-${copies + 1}`;

    try {
      return await this.prisma.bill.create({
        data: {
          billNumber,
          vendorId: original.vendorId,
          date: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: BillStatus.DRAFT,
          subtotal: original.subtotal,
          taxAmount: original.taxAmount,
          grandTotal: original.grandTotal,
          balanceDue: original.grandTotal,
          currencyCode: original.currencyCode,
          notes: original.notes,
          projectId: original.projectId,
          organizationId,
          lines: {
            create: original.lines.map((line) => ({
              itemId: line.itemId,
              accountId: line.accountId,
              description: line.description,
              quantity: line.quantity,
              rate: line.rate,
              taxRate: line.taxRate,
              amount: line.amount,
            })),
          },
        },
        include: { vendor: { select: { id: true, name: true } }, lines: true },
      });
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async remove(organizationId: string, id: string) {
    const { count } = await this.prisma.bill.updateMany({
      where: { id, organizationId, deletedAt: null, status: BillStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.bill.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Bill not found');
      throw new BadRequestException('Only draft bills can be deleted');
    }
    return { message: 'Bill deleted successfully' };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueBills(): Promise<void> {
    await this.prisma.bill.updateMany({
      where: {
        status: { in: [BillStatus.OPEN, BillStatus.PARTIALLY_PAID] },
        dueDate: { lt: new Date() },
        balanceDue: { gt: 0 },
        deletedAt: null,
      },
      data: { status: BillStatus.OVERDUE },
    });
  }

  // === Bulk Operations — same command as the single-record routes ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }

  bulkOpen(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return this.bulkApprove(organizationId, ids);
  }

  bulkApprove(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.approve(organizationId, id));
  }

  // === Helpers ===

  private buildLines(lines: BillLineDto[]) {
    const totals = computeDocumentTotals(
      lines.map((l) => ({ quantity: l.quantity, rate: l.rate, taxRatePercent: l.taxRate })),
    );
    const lineData = lines.map((line, i) => ({
      ...(line.itemId && { itemId: line.itemId }),
      ...(line.accountId && { accountId: line.accountId }),
      description: line.description || '',
      quantity: new Decimal(line.quantity),
      rate: new Decimal(line.rate),
      taxRate: new Decimal(line.taxRate || '0'),
      amount: totals.lines[i].netAmount,
    }));
    return { lineData, totals };
  }

  /** Every referenced id must belong to the caller's organization. */
  private async assertReferences(
    db: Prisma.TransactionClient,
    organizationId: string,
    dto: Partial<Pick<CreateBillDto, 'vendorId' | 'projectId' | 'lines'>>,
  ): Promise<void> {
    if (dto.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: dto.vendorId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!vendor) throw new BadRequestException('Vendor not found');
    }
    if (dto.projectId) {
      const project = await db.project.findFirst({
        where: { id: dto.projectId, organizationId },
        select: { id: true },
      });
      if (!project) throw new BadRequestException('Project not found');
    }
    const lines = dto.lines ?? [];
    const accountIds = [...new Set(lines.map((l) => l.accountId).filter(Boolean))] as string[];
    if (accountIds.length) {
      const found = await db.account.count({
        where: { id: { in: accountIds }, organizationId, deletedAt: null },
      });
      if (found !== accountIds.length) throw new BadRequestException('Account not found');
    }
    const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))] as string[];
    if (itemIds.length) {
      const found = await db.item.count({ where: { id: { in: itemIds }, organizationId } });
      if (found !== itemIds.length) throw new BadRequestException('Item not found');
    }
  }

  /**
   * Atomically reserves the organization's next bill number (e.g. BILL-0007). Numbers already
   * used (e.g. bills created before the counter existed) are skipped.
   */
  private async nextBillNumber(organizationId: string): Promise<string> {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const org = await this.prisma.organization.update({
        where: { id: organizationId },
        data: { billNextNumber: { increment: 1 } },
        select: { billPrefix: true, billNextNumber: true },
      });
      const candidate = `${org.billPrefix}${String(org.billNextNumber - 1).padStart(4, '0')}`;
      const taken = await this.prisma.bill.count({
        where: { organizationId, billNumber: candidate },
      });
      if (taken === 0) return candidate;
    }
    throw new ConflictException('Could not allocate a bill number; provide one explicitly');
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('A bill with this number already exists for this vendor');
    }
    return error;
  }
}
