import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { computeDocumentTotals } from '../../../common/utils/document-totals';
import { assertTotalsFit } from '../../sales/utils/sales-helpers';

/**
 * Confirm payload. Money and percentages travel as decimal strings; the
 * `taxRatePercent` is a percentage (14 => 14%), never a tax amount.
 */
export interface ConfirmIntakeLineInput {
  itemId?: string;
  accountId?: string;
  taxRateId?: string;
  description: string;
  quantity: string;
  rate: string;
  taxRatePercent?: string;
  discountPercent?: string;
}

export interface ConfirmIntakeInput {
  type: 'BILL' | 'INVOICE';
  vendorId?: string;
  customerId?: string;
  date: string;
  dueDate: string;
  documentNumber?: string;
  reference?: string;
  currencyCode?: string;
  lines: ConfirmIntakeLineInput[];
  notes?: string;
  projectId?: string;
  /** User corrections for AI learning */
  corrections?: Record<string, unknown>;
}

/** A confirmed line after tenant validation and Decimal computation. */
interface ResolvedIntakeLine {
  itemId: string | null;
  accountId: string | null;
  taxRateId: string | null;
  description: string;
  quantity: Decimal;
  rate: Decimal;
  taxRatePercent: Decimal;
  discountPercent: Decimal;
  netAmount: Decimal;
  taxAmount: Decimal;
}

interface ResolvedIntakeDocument {
  currencyCode: string;
  lines: ResolvedIntakeLine[];
  subtotal: Decimal;
  taxAmount: Decimal;
  grandTotal: Decimal;
}

function uniqueIds(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))];
}

@Injectable()
export class IntakeConfirmationService {
  private readonly logger = new Logger(IntakeConfirmationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Confirm extracted data and create a draft Bill or Invoice.
   *
   * Every referenced id (party, project, item, account, tax rate) is verified to
   * belong to `organizationId` before anything is written; a foreign or unknown
   * id is rejected with 400 and no mutation. Totals come from the shared Decimal
   * calculator: `taxRatePercent` is a percentage, line `amount` is the net.
   */
  async confirmAndCreate(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<{ type: 'bill' | 'invoice'; id: string; number: string }> {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    if (dto.type === 'BILL') {
      return this.createDraftBill(organizationId, dto);
    }
    if (dto.type === 'INVOICE') {
      return this.createDraftInvoice(organizationId, dto);
    }
    throw new BadRequestException('type must be BILL or INVOICE');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate tenant ownership of every referenced id and compute totals.
   * Read-only: performs no writes.
   */
  private async resolveConfirmation(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<ResolvedIntakeDocument> {
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('At least one line is required');
    }
    for (const field of ['date', 'dueDate'] as const) {
      const value = dto[field];
      if (!value || isNaN(new Date(value).getTime())) {
        throw new BadRequestException(`${field} must be a valid date`);
      }
    }

    // Party
    if (dto.type === 'BILL') {
      if (!dto.vendorId) {
        throw new BadRequestException('Vendor is required to create a bill');
      }
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!vendor) {
        throw new BadRequestException('vendorId does not reference a vendor in this organization');
      }
    } else {
      if (!dto.customerId) {
        throw new BadRequestException('Customer is required to create an invoice');
      }
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException(
          'customerId does not reference a customer in this organization',
        );
      }
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        throw new BadRequestException(
          'projectId does not reference a project in this organization',
        );
      }
    }

    const itemIds = uniqueIds(dto.lines.map((l) => l.itemId));
    const accountIds = uniqueIds(dto.lines.map((l) => l.accountId));
    const taxRateIds = uniqueIds(dto.lines.map((l) => l.taxRateId));

    if (itemIds.length > 0) {
      const items = await this.prisma.item.findMany({
        where: { id: { in: itemIds }, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (items.length !== itemIds.length) {
        throw new BadRequestException('itemId does not reference an item in this organization');
      }
    }

    if (accountIds.length > 0) {
      const accounts = await this.prisma.account.findMany({
        where: { id: { in: accountIds }, organizationId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (accounts.length !== accountIds.length) {
        throw new BadRequestException(
          'accountId does not reference an active account in this organization',
        );
      }
    }

    const taxRatePercentById = new Map<string, Decimal>();
    if (taxRateIds.length > 0) {
      const taxRates = await this.prisma.taxRate.findMany({
        where: { id: { in: taxRateIds }, organizationId, deletedAt: null, isActive: true },
        select: { id: true, rate: true },
      });
      if (taxRates.length !== taxRateIds.length) {
        throw new BadRequestException(
          'taxRateId does not reference an active tax rate in this organization',
        );
      }
      for (const tr of taxRates) taxRatePercentById.set(tr.id, new Decimal(tr.rate.toString()));
    }

    // The ledger is single-currency: reject a foreign currency instead of posting it 1:1.
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    if (!org) throw new BadRequestException('Organization not found');
    const currencyCode = dto.currencyCode?.trim().toUpperCase() || org.baseCurrency.toUpperCase();
    if (currencyCode !== org.baseCurrency.toUpperCase()) {
      throw new BadRequestException(
        `Document currency ${currencyCode} differs from the base currency ${org.baseCurrency}; foreign-currency documents are not supported yet`,
      );
    }

    // Per-line tax/discount resolution. Unresolved tax is an error, never a silent 0.
    const prepared = dto.lines.map((line, index) => {
      const lineNo = index + 1;
      const discountPercent = new Decimal(line.discountPercent || '0');
      if (dto.type === 'BILL' && !discountPercent.isZero()) {
        throw new BadRequestException(
          `Line ${lineNo}: line discounts are not supported on bills; enter the net rate`,
        );
      }

      let taxRatePercent: Decimal | null =
        line.taxRatePercent !== undefined && line.taxRatePercent !== ''
          ? new Decimal(line.taxRatePercent)
          : null;
      if (line.taxRateId) {
        const recordPercent = taxRatePercentById.get(line.taxRateId);
        if (!recordPercent) {
          throw new BadRequestException(`Line ${lineNo}: unknown taxRateId`);
        }
        if (taxRatePercent && !taxRatePercent.equals(recordPercent)) {
          throw new BadRequestException(
            `Line ${lineNo}: taxRatePercent does not match the selected tax rate`,
          );
        }
        taxRatePercent = recordPercent;
      }
      if (taxRatePercent === null) {
        throw new BadRequestException(
          `Line ${lineNo}: tax rate is unresolved; provide taxRatePercent (use "0" for no tax) or taxRateId`,
        );
      }

      return {
        itemId: line.itemId || null,
        accountId: line.accountId || null,
        taxRateId: line.taxRateId || null,
        description: line.description,
        quantity: new Decimal(line.quantity),
        rate: new Decimal(line.rate),
        taxRatePercent,
        discountPercent,
      };
    });

    const totals = computeDocumentTotals(
      prepared.map((l) => ({
        quantity: l.quantity,
        rate: l.rate,
        taxRatePercent: l.taxRatePercent,
        discountPercent: l.discountPercent,
      })),
    );

    // Same Decimal(19, 4) bound as manual invoices/bills: nothing is written that cannot be stored.
    assertTotalsFit(totals);

    return {
      currencyCode,
      lines: prepared.map((l, i) => ({
        ...l,
        netAmount: totals.lines[i].netAmount,
        taxAmount: totals.lines[i].taxAmount,
      })),
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
    };
  }

  private async createDraftBill(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<{ type: 'bill'; id: string; number: string }> {
    const resolved = await this.resolveConfirmation(organizationId, dto);
    const vendorId = dto.vendorId as string;

    const billNumber = dto.documentNumber || (await this.generateBillNumber(organizationId));

    const bill = await this.prisma.bill.create({
      data: {
        billNumber,
        vendorId,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: resolved.subtotal,
        taxAmount: resolved.taxAmount,
        grandTotal: resolved.grandTotal,
        balanceDue: resolved.grandTotal,
        reference: dto.reference,
        currencyCode: resolved.currencyCode,
        notes: dto.notes || 'Created from document scan',
        projectId: dto.projectId || null,
        organizationId,
        lines: {
          create: resolved.lines.map((line) => ({
            itemId: line.itemId,
            accountId: line.accountId,
            taxRateId: line.taxRateId,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            taxRate: line.taxRatePercent,
            amount: line.netAmount,
          })),
        },
      },
      select: { id: true },
    });

    this.logger.log(
      `Created draft bill ${bill.id} (${resolved.lines.length} lines) from document intake for org ${organizationId}`,
    );

    return { type: 'bill', id: bill.id, number: billNumber };
  }

  private async createDraftInvoice(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<{ type: 'invoice'; id: string; number: string }> {
    const resolved = await this.resolveConfirmation(organizationId, dto);
    const customerId = dto.customerId as string;

    const invoiceNumber = await this.generateInvoiceNumber(organizationId);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        projectId: dto.projectId || null,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: resolved.subtotal,
        taxAmount: resolved.taxAmount,
        shippingAmount: new Decimal(0),
        grandTotal: resolved.grandTotal,
        balanceDue: resolved.grandTotal,
        currencyCode: resolved.currencyCode,
        notes: dto.notes || 'Created from document scan',
        organizationId,
        lines: {
          // InvoiceLine has no accountId column; a supplied account is only validated.
          create: resolved.lines.map((line) => ({
            itemId: line.itemId,
            taxRateId: line.taxRateId,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            discount: line.discountPercent,
            taxRate: line.taxRatePercent,
            amount: line.netAmount,
          })),
        },
      },
      select: { id: true },
    });

    this.logger.log(
      `Created draft invoice ${invoice.id} (${resolved.lines.length} lines) from document intake for org ${organizationId}`,
    );

    return { type: 'invoice', id: invoice.id, number: invoiceNumber };
  }

  private async generateBillNumber(organizationId: string): Promise<string> {
    const lastBill = await this.prisma.bill.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { billNumber: true },
    });

    if (!lastBill || !lastBill.billNumber) {
      return 'BILL-001';
    }

    const parts = lastBill.billNumber.split('-');
    const lastNumber = parseInt(parts[parts.length - 1], 10);
    if (isNaN(lastNumber)) {
      return 'BILL-001';
    }

    return `BILL-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    if (!lastInvoice || !lastInvoice.invoiceNumber) {
      return 'INV-001';
    }

    const parts = lastInvoice.invoiceNumber.split('-');
    const lastNumber = parseInt(parts[parts.length - 1], 10);
    if (isNaN(lastNumber)) {
      return 'INV-001';
    }

    return `INV-${String(lastNumber + 1).padStart(3, '0')}`;
  }
}
