import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExportFormat, ImportEntityType } from '../dto/import-export.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportData(
    organizationId: string,
    entityType: ImportEntityType,
    options: {
      format: ExportFormat;
      dateFrom?: Date;
      dateTo?: Date;
      fields?: string[];
      includeDeleted?: boolean;
    },
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const data = await this.fetchData(organizationId, entityType, options);

    if (data.length === 0) {
      throw new BadRequestException('No data to export');
    }

    // Filter fields if specified
    let exportData = data;
    if (options.fields && options.fields.length > 0) {
      exportData = data.map((row) => {
        const filtered: Record<string, unknown> = {};
        options.fields!.forEach((field) => {
          if (field in row) {
            filtered[field] = row[field];
          }
        });
        return filtered;
      });
    }

    // Generate export based on format
    switch (options.format) {
      case ExportFormat.CSV:
        return this.exportToCsv(exportData, entityType);
      case ExportFormat.XLSX:
        return this.exportToExcel(exportData, entityType);
      case ExportFormat.JSON:
        return this.exportToJson(exportData, entityType);
      default:
        throw new BadRequestException('Unsupported export format');
    }
  }

  private async fetchData(
    organizationId: string,
    entityType: ImportEntityType,
    options: {
      dateFrom?: Date;
      dateTo?: Date;
      includeDeleted?: boolean;
    },
  ): Promise<Record<string, unknown>[]> {
    const deletedFilter = options.includeDeleted ? {} : { deletedAt: null };
    const dateFilter =
      options.dateFrom || options.dateTo
        ? {
            createdAt: {
              ...(options.dateFrom ? { gte: options.dateFrom } : {}),
              ...(options.dateTo ? { lte: options.dateTo } : {}),
            },
          }
        : {};

    switch (entityType) {
      case ImportEntityType.CUSTOMERS:
        return this.exportCustomers(organizationId, deletedFilter, dateFilter);

      case ImportEntityType.VENDORS:
        return this.exportVendors(organizationId, deletedFilter, dateFilter);

      case ImportEntityType.ITEMS:
        return this.exportItems(organizationId, deletedFilter, dateFilter);

      case ImportEntityType.ACCOUNTS:
        return this.exportAccounts(organizationId);

      case ImportEntityType.INVOICES:
        return this.exportInvoices(organizationId, deletedFilter, dateFilter);

      case ImportEntityType.BILLS:
        return this.exportBills(organizationId, deletedFilter, dateFilter);

      case ImportEntityType.EXPENSES:
        return this.exportExpenses(organizationId, deletedFilter, dateFilter);

      case ImportEntityType.JOURNALS:
        return this.exportJournals(organizationId, dateFilter);

      case ImportEntityType.BANK_TRANSACTIONS:
        return this.exportBankTransactions(organizationId, dateFilter);

      case ImportEntityType.EMPLOYEES:
        return this.exportEmployees(organizationId, deletedFilter, dateFilter);

      default:
        throw new BadRequestException(`Export for ${entityType} not supported`);
    }
  }

  // ============ Entity-specific Export Methods ============

  private async exportCustomers(
    organizationId: string,
    deletedFilter: Record<string, unknown>,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, ...deletedFilter, ...dateFilter },
      orderBy: { name: 'asc' },
    });

    return customers.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      country: c.country,
      taxId: c.taxId,
      paymentTerms: c.paymentTerms,
      creditLimit: c.creditLimit?.toString(),
      createdAt: c.createdAt.toISOString(),
    }));
  }

  private async exportVendors(
    organizationId: string,
    deletedFilter: Record<string, unknown>,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId, ...deletedFilter, ...dateFilter },
      orderBy: { name: 'asc' },
    });

    return vendors.map((v) => ({
      name: v.name,
      email: v.email,
      phone: v.phone,
      address: v.address,
      city: v.city,
      country: v.country,
      taxId: v.taxId,
      paymentTerms: v.paymentTerms,
      bankName: v.bankName,
      bankAccount: v.bankAccount,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  private async exportItems(
    organizationId: string,
    deletedFilter: Record<string, unknown>,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const items = await this.prisma.item.findMany({
      where: { organizationId, ...deletedFilter, ...dateFilter },
      orderBy: { name: 'asc' },
    });

    return items.map((i) => ({
      name: i.name,
      sku: i.sku,
      type: i.type,
      description: i.description,
      salesPrice: i.salesPrice?.toString(),
      purchasePrice: i.purchasePrice?.toString(),
      unit: i.unit,
      taxRate: i.taxRate?.toString(),
      trackInventory: i.trackInventory,
      reorderLevel: i.reorderLevel,
      createdAt: i.createdAt.toISOString(),
    }));
  }

  private async exportAccounts(organizationId: string): Promise<Record<string, unknown>[]> {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId },
      include: { parent: { select: { code: true } } },
      orderBy: { code: 'asc' },
    });

    return accounts.map((a) => ({
      name: a.name,
      code: a.code,
      type: a.type,
      subType: a.subType,
      description: a.description,
      parentCode: a.parent?.code,
      openingBalance: a.openingBalance?.toString(),
      isActive: a.isActive,
    }));
  }

  private async exportInvoices(
    organizationId: string,
    deletedFilter: Record<string, unknown>,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        ...deletedFilter,
        ...(dateFilter.createdAt ? { date: dateFilter.createdAt } : {}),
      },
      include: {
        customer: { select: { name: true, email: true } },
        lines: { include: { item: { select: { name: true, sku: true } } } },
      },
      orderBy: { date: 'desc' },
    });

    // Flatten to line items
    const rows: Record<string, unknown>[] = [];
    for (const inv of invoices) {
      for (const line of inv.lines) {
        rows.push({
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customer.name,
          customerEmail: inv.customer.email,
          date: inv.date.toISOString().split('T')[0],
          dueDate: inv.dueDate.toISOString().split('T')[0],
          status: inv.status,
          itemName: line.item?.name,
          itemSku: line.item?.sku,
          description: line.description,
          quantity: line.quantity.toString(),
          rate: line.rate.toString(),
          amount: line.amount.toString(),
          invoiceSubtotal: inv.subtotal.toString(),
          invoiceTax: inv.taxAmount.toString(),
          invoiceTotal: inv.grandTotal.toString(),
          balanceDue: inv.balanceDue.toString(),
          notes: inv.notes,
        });
      }
    }

    return rows;
  }

  private async exportBills(
    organizationId: string,
    deletedFilter: Record<string, unknown>,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        ...deletedFilter,
        ...(dateFilter.createdAt ? { date: dateFilter.createdAt } : {}),
      },
      include: {
        vendor: { select: { name: true, email: true } },
        lines: { include: { item: { select: { name: true, sku: true } } } },
      },
      orderBy: { date: 'desc' },
    });

    const rows: Record<string, unknown>[] = [];
    for (const bill of bills) {
      for (const line of bill.lines) {
        rows.push({
          billNumber: bill.billNumber,
          vendorName: bill.vendor.name,
          vendorEmail: bill.vendor.email,
          date: bill.date.toISOString().split('T')[0],
          dueDate: bill.dueDate.toISOString().split('T')[0],
          reference: bill.reference,
          status: bill.status,
          itemName: line.item?.name,
          itemSku: line.item?.sku,
          description: line.description,
          quantity: line.quantity.toString(),
          rate: line.rate.toString(),
          amount: line.amount.toString(),
          billSubtotal: bill.subtotal.toString(),
          billTax: bill.taxAmount.toString(),
          billTotal: bill.grandTotal.toString(),
          balanceDue: bill.balanceDue.toString(),
        });
      }
    }

    return rows;
  }

  private async exportExpenses(
    organizationId: string,
    deletedFilter: Record<string, unknown>,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        ...deletedFilter,
        ...(dateFilter.createdAt ? { date: dateFilter.createdAt } : {}),
      },
      include: {
        vendor: { select: { name: true, email: true } },
        account: { select: { name: true, code: true } },
      },
      orderBy: { date: 'desc' },
    });

    return expenses.map((e) => ({
      date: e.date.toISOString().split('T')[0],
      vendorName: e.vendor?.name,
      vendorEmail: e.vendor?.email,
      accountName: e.account?.name,
      accountCode: e.account?.code,
      amount: e.amount.toString(),
      taxAmount: e.taxAmount?.toString(),
      reference: e.reference,
      description: e.description,
      status: e.status,
    }));
  }

  private async exportJournals(
    organizationId: string,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const journals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        ...(dateFilter.createdAt ? { date: dateFilter.createdAt } : {}),
      },
      include: {
        lines: {
          include: { account: { select: { name: true, code: true } } },
        },
      },
      orderBy: { date: 'desc' },
    });

    const rows: Record<string, unknown>[] = [];
    for (const journal of journals) {
      for (const line of journal.lines) {
        rows.push({
          journalNumber: journal.journalNumber,
          date: journal.date.toISOString().split('T')[0],
          reference: journal.reference,
          accountName: line.account.name,
          accountCode: line.account.code,
          debit: line.debit.toString(),
          credit: line.credit.toString(),
          description: line.description,
          journalNotes: journal.notes,
        });
      }
    }

    return rows;
  }

  private async exportBankTransactions(
    organizationId: string,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const transactions = await this.prisma.bankTransaction.findMany({
      where: {
        organizationId,
        ...(dateFilter.createdAt ? { date: dateFilter.createdAt } : {}),
      },
      include: {
        bankAccount: { select: { name: true, accountNumber: true } },
      },
      orderBy: { date: 'desc' },
    });

    return transactions.map((t) => ({
      date: t.date.toISOString().split('T')[0],
      bankAccountName: t.bankAccount?.name,
      bankAccountNumber: t.bankAccount?.accountNumber,
      description: t.description,
      amount: t.amount.toString(),
      type: t.type,
      reference: t.reference,
      isReconciled: t.isReconciled,
      matchedEntityType: t.matchedEntityType,
      matchedEntityId: t.matchedEntityId,
    }));
  }

  private async exportEmployees(
    organizationId: string,
    deletedFilter: Record<string, unknown>,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, ...dateFilter },
      orderBy: { name: 'asc' },
    });

    return employees.map((e) => ({
      name: e.name,
      email: e.email,
      employeeNumber: e.employeeNumber || e.employeeId,
      phone: e.phone,
      position: e.position || e.jobTitle,
      departmentName: e.department,
      hireDate: (e.hireDate || e.dateOfJoining).toISOString().split('T')[0],
      baseSalary: (e.baseSalary || e.basicSalary).toString(),
      bankAccount: e.bankAccount,
      nationalId: e.nationalId,
      status: e.status || (e.isActive ? 'ACTIVE' : 'INACTIVE'),
    }));
  }

  // ============ Export Format Generators ============

  private exportToCsv(
    data: Record<string, unknown>[],
    entityType: ImportEntityType,
  ): { buffer: Buffer; filename: string; contentType: string } {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);

    return {
      buffer: Buffer.from(csvContent, 'utf-8'),
      filename: `${entityType}-export-${Date.now()}.csv`,
      contentType: 'text/csv',
    };
  }

  private exportToExcel(
    data: Record<string, unknown>[],
    entityType: ImportEntityType,
  ): { buffer: Buffer; filename: string; contentType: string } {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Auto-size columns
    const maxWidth = 50;
    const cols: XLSX.ColInfo[] = [];
    if (data.length > 0) {
      Object.keys(data[0]).forEach((key) => {
        let maxLen = key.length;
        data.forEach((row) => {
          const val = row[key];
          if (val) {
            maxLen = Math.max(maxLen, String(val).length);
          }
        });
        cols.push({ wch: Math.min(maxLen + 2, maxWidth) });
      });
      worksheet['!cols'] = cols;
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, entityType);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      buffer: Buffer.from(buffer),
      filename: `${entityType}-export-${Date.now()}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private exportToJson(
    data: Record<string, unknown>[],
    entityType: ImportEntityType,
  ): { buffer: Buffer; filename: string; contentType: string } {
    return {
      buffer: Buffer.from(JSON.stringify(data, null, 2), 'utf-8'),
      filename: `${entityType}-export-${Date.now()}.json`,
      contentType: 'application/json',
    };
  }

  // ============ Template Generation ============

  async generateImportTemplate(
    entityType: ImportEntityType,
    format: ExportFormat = ExportFormat.XLSX,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const { ENTITY_FIELD_DEFINITIONS } = await import('../dto/import-export.dto');
    const fields = ENTITY_FIELD_DEFINITIONS[entityType] || [];

    // Create header row and example row
    const headers: Record<string, string> = {};
    const example: Record<string, string> = {};

    fields.forEach((field) => {
      headers[field.label] = field.label;
      example[field.label] = field.example || '';
    });

    const data = [example]; // Include example row

    if (format === ExportFormat.CSV) {
      return this.exportToCsv(data, entityType);
    } else {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

      // Add field descriptions sheet
      const descriptions = fields.map((f) => ({
        Field: f.label,
        Required: f.required ? 'Yes' : 'No',
        Type: f.type,
        Description: f.description || '',
        Example: f.example || '',
        'Allowed Values': f.enumValues?.join(', ') || '',
      }));
      const descSheet = XLSX.utils.json_to_sheet(descriptions);
      XLSX.utils.book_append_sheet(workbook, descSheet, 'Field Descriptions');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return {
        buffer: Buffer.from(buffer),
        filename: `${entityType}-import-template.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
  }
}
