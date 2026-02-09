import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VATReturnStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class VatReturnsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: { startDate: string; endDate: string }) {
    // Generate period string
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const period = `${startDate.getFullYear()}-Q${Math.ceil((startDate.getMonth() + 1) / 3)}`;

    // Check for existing period
    const existing = await this.prisma.vATReturn.findFirst({
      where: { organizationId, period },
    });
    if (existing) throw new BadRequestException('VAT return for this period already exists');

    const returnNumber = await this.generateReturnNumber(organizationId);

    return this.prisma.vATReturn.create({
      data: {
        returnNumber,
        period,
        periodStart: startDate,
        periodEnd: endDate,
        startDate,
        endDate,
        status: VATReturnStatus.DRAFT,
        totalSales: new Decimal(0),
        outputVAT: new Decimal(0),
        totalPurchases: new Decimal(0),
        inputVAT: new Decimal(0),
        netPayable: new Decimal(0),
        organizationId,
      },
    });
  }

  async calculate(organizationId: string, id: string) {
    const vatReturn = await this.prisma.vATReturn.findFirst({
      where: { id, organizationId },
    });
    if (!vatReturn) throw new NotFoundException('VAT return not found');
    if (vatReturn.status !== VATReturnStatus.DRAFT) {
      throw new BadRequestException('Can only calculate draft VAT returns');
    }

    const { startDate, endDate } = vatReturn;

    // Calculate Output VAT (VAT collected on sales)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        issueDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
    });
    const totalSales = invoices.reduce((sum, inv) => sum + parseFloat(inv.subtotal.toString()), 0);
    const outputVAT = invoices.reduce((sum, inv) => sum + parseFloat(inv.taxAmount.toString()), 0);

    // Calculate Input VAT (VAT paid on purchases)
    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
    });
    const totalPurchases = bills.reduce((sum, b) => sum + parseFloat(b.subtotal.toString()), 0);
    const inputVAT = bills.reduce((sum, bill) => sum + parseFloat(bill.taxAmount.toString()), 0);

    // Calculate expenses VAT
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
      },
    });
    const expenseVAT = expenses.reduce((sum, exp) => sum + parseFloat(exp.taxAmount.toString()), 0);

    const totalInputVAT = inputVAT + expenseVAT;
    const netPayable = outputVAT - totalInputVAT;

    return this.prisma.vATReturn.update({
      where: { id },
      data: {
        totalSales: new Decimal(totalSales),
        outputVAT: new Decimal(outputVAT),
        totalPurchases: new Decimal(totalPurchases),
        inputVAT: new Decimal(totalInputVAT),
        netPayable: new Decimal(netPayable),
        status: VATReturnStatus.CALCULATED,
      },
    });
  }

  async findAll(organizationId: string, query: { status?: string; year?: number }) {
    const where: any = { organizationId };
    if (query.status) where.status = query.status;
    if (query.year) {
      where.startDate = {
        gte: new Date(query.year, 0, 1),
        lt: new Date(query.year + 1, 0, 1),
      };
    }

    return this.prisma.vATReturn.findMany({
      where,
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const vatReturn = await this.prisma.vATReturn.findFirst({
      where: { id, organizationId },
      include: { payment: true },
    });
    if (!vatReturn) throw new NotFoundException('VAT return not found');
    return vatReturn;
  }

  async submit(organizationId: string, id: string) {
    const vatReturn = await this.findOne(organizationId, id);
    if (vatReturn.status !== VATReturnStatus.CALCULATED) {
      throw new BadRequestException('VAT return must be calculated before submission');
    }

    // Lock the period - prevent editing of transactions in this period
    if (vatReturn.startDate && vatReturn.endDate) {
      await this.lockPeriod(organizationId, vatReturn.startDate, vatReturn.endDate);
    }

    return this.prisma.vATReturn.update({
      where: { id },
      data: {
        status: VATReturnStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
  }

  async recordPayment(
    organizationId: string,
    vatReturnId: string,
    dto: { amount: number; date: string; paidFromAccountId: string; reference?: string },
  ) {
    const vatReturn = await this.findOne(organizationId, vatReturnId);
    if (
      vatReturn.status !== VATReturnStatus.SUBMITTED &&
      vatReturn.status !== VATReturnStatus.FILED
    ) {
      throw new BadRequestException(
        'VAT return must be submitted or filed before recording payment',
      );
    }

    // Check if payment already exists (one-to-one relationship)
    if (vatReturn.payment) {
      throw new BadRequestException('Payment already recorded for this VAT return');
    }

    const payment = await this.prisma.vATPayment.create({
      data: {
        vatReturnId,
        amount: new Decimal(dto.amount),
        date: new Date(dto.date),
        paidFromAccountId: dto.paidFromAccountId,
        reference: dto.reference,
        organizationId,
      },
    });

    // Mark as filed
    await this.prisma.vATReturn.update({
      where: { id: vatReturnId },
      data: { status: VATReturnStatus.FILED, filedAt: new Date() },
    });

    return payment;
  }

  async getVatSummary(organizationId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Output VAT
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        issueDate: { gte: start, lte: end },
        deletedAt: null,
      },
    });
    const outputVAT = invoices.reduce((sum, inv) => sum + parseFloat(inv.taxAmount.toString()), 0);
    const salesTotal = invoices.reduce((sum, inv) => sum + parseFloat(inv.subtotal.toString()), 0);

    // Input VAT from bills
    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        date: { gte: start, lte: end },
        deletedAt: null,
      },
    });
    const billVAT = bills.reduce((sum, bill) => sum + parseFloat(bill.taxAmount.toString()), 0);
    const purchasesTotal = bills.reduce((sum, b) => sum + parseFloat(b.subtotal.toString()), 0);

    // Input VAT from expenses
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: start, lte: end },
      },
    });
    const expenseVAT = expenses.reduce((sum, exp) => sum + parseFloat(exp.taxAmount.toString()), 0);

    const inputVAT = billVAT + expenseVAT;
    const netVAT = outputVAT - inputVAT;

    return {
      period: { start: startDate, end: endDate },
      sales: {
        count: invoices.length,
        total: salesTotal,
        vatCollected: outputVAT,
      },
      purchases: {
        billCount: bills.length,
        expenseCount: expenses.length,
        totalPurchases: purchasesTotal,
        vatPaid: inputVAT,
      },
      netVAT,
      vatPayable: netVAT > 0 ? netVAT : 0,
      vatRefundable: netVAT < 0 ? Math.abs(netVAT) : 0,
    };
  }

  async deleteReturn(organizationId: string, id: string) {
    const vatReturn = await this.findOne(organizationId, id);
    if (vatReturn.status !== VATReturnStatus.DRAFT) {
      throw new BadRequestException('Only draft VAT returns can be deleted');
    }

    await this.prisma.vATReturn.delete({ where: { id } });
    return { message: 'VAT return deleted' };
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    const result = await this.prisma.vATReturn.deleteMany({
      where: {
        id: { in: ids },
        organizationId,
        status: VATReturnStatus.DRAFT,
      },
    });
    return { deleted: result.count, total: ids.length };
  }

  async bulkSubmit(organizationId: string, ids: string[]) {
    const result = await this.prisma.vATReturn.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        status: VATReturnStatus.CALCULATED,
      },
      data: { status: VATReturnStatus.SUBMITTED, submittedAt: new Date() },
    });
    return { submitted: result.count, total: ids.length };
  }

  private async lockPeriod(organizationId: string, start: Date, end: Date) {
    // Update organization's lock date if this period extends beyond it
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return;
    if (!org.lockDate || org.lockDate < end) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { lockDate: end },
      });
    }
  }

  private async generateReturnNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.vATReturn.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { returnNumber: true },
    });
    if (!last || !last.returnNumber) return 'VAT-001';
    const num = parseInt(last.returnNumber.split('-')[1], 10);
    return `VAT-${String(num + 1).padStart(3, '0')}`;
  }
}
