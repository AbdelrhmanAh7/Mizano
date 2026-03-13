import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { CreateBillDto } from '../dto/create-bill.dto';
import { UpdateBillDto } from '../dto/update-bill.dto';

@Injectable()
export class BillsService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateBillDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, organizationId, deletedAt: null },
    });
    if (!vendor) throw new BadRequestException('Vendor not found');

    let subtotal = 0,
      taxAmount = 0;
    const lines = dto.lines.map((line) => {
      const qty = parseFloat(line.quantity);
      const rate = parseFloat(line.rate);
      const tax = parseFloat(line.taxRate || '0');
      const lineTotal = qty * rate;
      subtotal += lineTotal;
      taxAmount += lineTotal * (tax / 100);
      return { ...line, amount: lineTotal.toFixed(4) };
    });

    return this.prisma.bill.create({
      data: {
        billNumber: dto.billNumber,
        vendorId: dto.vendorId,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        grandTotal: new Decimal(subtotal + taxAmount),
        balanceDue: new Decimal(subtotal + taxAmount),
        notes: dto.notes,
        projectId: dto.projectId,
        organizationId,
        lines: {
          create: lines.map((line) => ({
            ...(line.itemId && { itemId: line.itemId }),
            ...(line.accountId && { accountId: line.accountId }),
            description: line.description || '',
            quantity: new Decimal(line.quantity),
            rate: new Decimal(line.rate),
            taxRate: new Decimal(line.taxRate || '0'),
            amount: new Decimal(line.amount),
          })),
        },
      },
      include: { vendor: { select: { id: true, name: true } }, lines: true },
    });
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
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

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    return cursorPaginate(
      this.prisma.bill,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: { vendor: { select: { id: true, name: true } } },
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { vendor: true, lines: true, billAllocations: true },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  async update(organizationId: string, id: string, dto: UpdateBillDto) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== 'DRAFT') throw new BadRequestException('Only draft bills can be updated');

    const { lines: _lines, ...rest } = dto;
    const data: Prisma.BillUpdateInput = {};
    if (rest.billNumber !== undefined) data.billNumber = rest.billNumber;
    if (rest.date !== undefined) data.date = new Date(rest.date);
    if (rest.dueDate !== undefined) data.dueDate = new Date(rest.dueDate);
    if (rest.notes !== undefined) data.notes = rest.notes;
    if (rest.vendorId !== undefined) data.vendor = { connect: { id: rest.vendorId } };
    if (rest.projectId !== undefined) data.project = { connect: { id: rest.projectId } };

    return this.prisma.bill.update({ where: { id }, data });
  }

  async updateBalanceDue(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { billAllocations: true },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found for balance update`);

    const totalPayments = bill.billAllocations.reduce(
      (sum, a) => sum + parseFloat(a.amount.toString()),
      0,
    );
    const balanceDue = parseFloat(bill.grandTotal.toString()) - totalPayments;
    let status = bill.status;
    if (balanceDue <= 0) status = BillStatus.PAID;
    else if (totalPayments > 0) status = BillStatus.PARTIALLY_PAID;

    await this.prisma.bill.update({
      where: { id: billId },
      data: { balanceDue: new Decimal(Math.max(0, balanceDue)), status },
    });
  }

  async checkDuplicate(
    organizationId: string,
    dto: { vendorId: string; billNumber?: string; amount?: number; date?: string },
  ): Promise<{
    isDuplicate: boolean;
    existingBillId: string | null;
    similarity: number;
    matchType: 'exact_number' | 'amount_date' | 'none';
  }> {
    // Check 1: Exact bill number + vendor match
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

    // Check 2: Same vendor + similar amount + date within 3 days
    if (dto.amount && dto.date) {
      const targetDate = new Date(dto.date);
      const dateFrom = new Date(targetDate);
      dateFrom.setDate(dateFrom.getDate() - 3);
      const dateTo = new Date(targetDate);
      dateTo.setDate(dateTo.getDate() + 3);

      const amountVariance = dto.amount * 0.01; // ±1%
      const amountLow = dto.amount - amountVariance;
      const amountHigh = dto.amount + amountVariance;

      const amountMatch = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId: dto.vendorId,
          deletedAt: null,
          grandTotal: {
            gte: new Decimal(amountLow),
            lte: new Decimal(amountHigh),
          },
          date: {
            gte: dateFrom,
            lte: dateTo,
          },
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

    return {
      isDuplicate: false,
      existingBillId: null,
      similarity: 0,
      matchType: 'none',
    };
  }

  async open(organizationId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException('Only draft bills can be opened');
    }

    const updated = await this.prisma.bill.update({
      where: { id },
      data: { status: BillStatus.OPEN },
    });

    return { data: updated };
  }

  async approve(organizationId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { lines: true },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException('Only draft bills can be approved');
    }

    // Validate all lines have expense accounts assigned
    const linesWithoutAccount = bill.lines.filter((l) => !l.accountId);
    if (linesWithoutAccount.length > 0) {
      throw new BadRequestException(
        'All bill lines must have an expense account assigned before approval',
      );
    }

    // Get organization default accounts
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        defaultApAccountId: true,
        defaultVatReceivableAccountId: true,
      },
    });

    if (!org?.defaultApAccountId) {
      throw new BadRequestException(
        'Please configure default Accounts Payable account in organization settings before approving bills',
      );
    }

    // Create accounting entry: Dr Expense lines / Dr VAT Receivable / Cr AP
    const grandTotal = parseFloat(bill.grandTotal.toString());
    const taxAmount = parseFloat(bill.taxAmount.toString());

    const journalLines: Array<{
      accountId: string;
      debit: string;
      credit: string;
      description?: string;
    }> = [];

    // Debit expense accounts from bill lines
    for (const line of bill.lines) {
      journalLines.push({
        accountId: line.accountId as string,
        debit: parseFloat(line.amount.toString()).toFixed(4),
        credit: '0',
        description: `Bill ${bill.billNumber} - ${(line.description as string) || 'Expense'}`,
      });
    }

    // Debit VAT Receivable if applicable
    if (taxAmount > 0 && org.defaultVatReceivableAccountId) {
      journalLines.push({
        accountId: org.defaultVatReceivableAccountId,
        debit: taxAmount.toFixed(4),
        credit: '0',
        description: `Bill ${bill.billNumber} - VAT Receivable`,
      });
    }

    // Credit AP for grand total
    journalLines.push({
      accountId: org.defaultApAccountId,
      debit: '0',
      credit: grandTotal.toFixed(4),
      description: `Bill ${bill.billNumber} - Accounts Payable`,
    });

    await this.journalsService.create(organizationId, {
      date: new Date().toISOString(),
      reference: `Bill ${bill.billNumber}`,
      notes: `Accounting entry for bill ${bill.billNumber}`,
      lines: journalLines,
    });

    return this.prisma.bill.update({
      where: { id },
      data: { status: BillStatus.OPEN },
      include: {
        vendor: { select: { id: true, name: true } },
        lines: true,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException('Only draft bills can be deleted');
    }

    await this.prisma.bill.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Bill deleted successfully' };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueBills() {
    const today = new Date();
    await this.prisma.bill.updateMany({
      where: {
        status: { in: [BillStatus.OPEN, BillStatus.PARTIALLY_PAID] },
        dueDate: { lt: today },
        deletedAt: null,
      },
      data: { status: BillStatus.OVERDUE },
    });
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    const result = await this.prisma.bill.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: 'DRAFT',
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
  }

  async bulkOpen(organizationId: string, ids: string[]) {
    const result = await this.prisma.bill.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: 'DRAFT',
      },
      data: { status: BillStatus.OPEN },
    });
    return { opened: result.count, total: ids.length };
  }

  async bulkApprove(organizationId: string, ids: string[]) {
    const result = await this.prisma.bill.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: BillStatus.DRAFT,
      },
      data: { status: BillStatus.OPEN },
    });
    return { approved: result.count, total: ids.length };
  }

  async bulkPay(organizationId: string, ids: string[]) {
    const result = await this.prisma.bill.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: { in: [BillStatus.OPEN, BillStatus.PARTIALLY_PAID, BillStatus.OVERDUE] },
      },
      data: { status: BillStatus.PAID, balanceDue: 0 },
    });
    return { paid: result.count, total: ids.length };
  }
}
