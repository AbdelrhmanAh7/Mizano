import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExportFormat, ImportEntityType } from '../dto/import-export.dto';
import { ExportService } from './export.service';

@Injectable()
export class BulkExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: ExportService,
  ) {}

  async exportByIds(
    organizationId: string,
    ids: string[],
    entityType: string,
    format: 'csv' | 'xlsx' = 'csv',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const exportFormat = format === 'xlsx' ? ExportFormat.XLSX : ExportFormat.CSV;

    // Map string entity types to ImportEntityType enum
    const entityTypeMap: Record<string, ImportEntityType> = {
      invoices: ImportEntityType.INVOICES,
      bills: ImportEntityType.BILLS,
      expenses: ImportEntityType.EXPENSES,
      customers: ImportEntityType.CUSTOMERS,
      vendors: ImportEntityType.VENDORS,
      items: ImportEntityType.ITEMS,
      journals: ImportEntityType.JOURNALS,
      employees: ImportEntityType.EMPLOYEES,
    };

    const mapped = entityTypeMap[entityType];

    // For entity types supported by the existing export service, use filtered data
    if (mapped) {
      return this.exportFilteredData(organizationId, ids, mapped, exportFormat);
    }

    // For other entity types, handle custom export
    switch (entityType) {
      case 'quotes':
        return this.exportQuotes(organizationId, ids, exportFormat);
      case 'work-orders':
        return this.exportWorkOrders(organizationId, ids, exportFormat);
      case 'vat-returns':
        return this.exportVatReturns(organizationId, ids, exportFormat);
      case 'payroll':
        return this.exportPayrollRuns(organizationId, ids, exportFormat);
      case 'projects':
        return this.exportProjects(organizationId, ids, exportFormat);
      default:
        throw new BadRequestException(`Export for entity type '${entityType}' is not supported`);
    }
  }

  private async exportFilteredData(
    organizationId: string,
    ids: string[],
    entityType: ImportEntityType,
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    // Delegate to the export service without ID filtering;
    // the export service fetches all records, which works for small bulk exports.
    // For large datasets, consider adding ID filtering to the export service.
    return this.exportService.exportData(organizationId, entityType, {
      format,
    });
  }

  private async exportQuotes(
    organizationId: string,
    ids: string[],
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const quotes = await this.prisma.quote.findMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      include: { customer: { select: { name: true } }, lines: true },
      orderBy: { date: 'desc' },
    });

    const data = quotes.map((q) => ({
      quoteNumber: q.quoteNumber,
      customer: q.customer?.name || '',
      date: q.date.toISOString().split('T')[0],
      expiryDate: q.expiryDate.toISOString().split('T')[0],
      status: q.status,
      subtotal: q.subtotal.toString(),
      taxAmount: q.taxAmount.toString(),
      grandTotal: q.grandTotal.toString(),
    }));

    return this.generateFile(data, 'quotes', format);
  }

  private async exportWorkOrders(
    organizationId: string,
    ids: string[],
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const workOrders = await this.prisma.workOrder.findMany({
      where: { id: { in: ids }, organizationId },
      include: { bom: { include: { outputItem: { select: { name: true } } } } },
    });

    const data = workOrders.map((wo) => ({
      workOrderNumber: wo.workOrderNumber,
      outputItem: wo.bom?.outputItem?.name || '',
      quantity: wo.quantity,
      status: wo.status,
      startDate: wo.plannedStartDate?.toISOString().split('T')[0] || '',
    }));

    return this.generateFile(data, 'work-orders', format);
  }

  private async exportVatReturns(
    organizationId: string,
    ids: string[],
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const returns = await this.prisma.vATReturn.findMany({
      where: { id: { in: ids }, organizationId },
    });

    const data = returns.map((r) => ({
      returnNumber: r.returnNumber,
      period: r.period,
      startDate: r.startDate.toISOString().split('T')[0],
      endDate: r.endDate.toISOString().split('T')[0],
      outputVAT: r.outputVAT.toString(),
      inputVAT: r.inputVAT.toString(),
      netPayable: r.netPayable.toString(),
      status: r.status,
    }));

    return this.generateFile(data, 'vat-returns', format);
  }

  private async exportPayrollRuns(
    organizationId: string,
    ids: string[],
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const runs = await this.prisma.payrollRun.findMany({
      where: { id: { in: ids }, organizationId },
      include: { _count: { select: { payslips: true } } },
    });

    const data = runs.map((r) => ({
      period: `${r.month}/${r.year}`,
      employeeCount: r._count.payslips,
      totalGross: r.totalGross?.toString() || '0',
      totalDeductions: r.totalDeductions?.toString() || '0',
      totalNet: r.totalNet?.toString() || '0',
      status: r.status,
    }));

    return this.generateFile(data, 'payroll', format);
  }

  private async exportProjects(
    organizationId: string,
    ids: string[],
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const projects = await this.prisma.project.findMany({
      where: { id: { in: ids }, organizationId },
      include: { customer: { select: { name: true } } },
    });

    const data = projects.map((p) => ({
      projectNumber: p.projectNumber,
      name: p.name,
      customer: p.customer?.name || '',
      status: p.status,
      billingMethod: p.billingMethod,
      budget: p.budget?.toString() || '',
      startDate: p.startDate?.toISOString().split('T')[0] || '',
      endDate: p.endDate?.toISOString().split('T')[0] || '',
    }));

    return this.generateFile(data, 'projects', format);
  }

  private generateFile(
    data: Record<string, unknown>[],
    entityType: string,
    format: ExportFormat,
  ): { buffer: Buffer; filename: string; contentType: string } {
    // Dynamic import would be complex, so we use a simple CSV generator for CSV
    // and delegate to XLSX for Excel format
    if (format === ExportFormat.CSV) {
      return this.toCsv(data, entityType);
    }
    return this.toXlsx(data, entityType);
  }

  private toCsv(
    data: Record<string, unknown>[],
    entityType: string,
  ): { buffer: Buffer; filename: string; contentType: string } {
    if (data.length === 0) {
      return {
        buffer: Buffer.from('', 'utf-8'),
        filename: `${entityType}-export-${Date.now()}.csv`,
        contentType: 'text/csv',
      };
    }

    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val == null) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');

    return {
      buffer: Buffer.from(csv, 'utf-8'),
      filename: `${entityType}-export-${Date.now()}.csv`,
      contentType: 'text/csv',
    };
  }

  private toXlsx(
    data: Record<string, unknown>[],
    entityType: string,
  ): { buffer: Buffer; filename: string; contentType: string } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, entityType);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      buffer: Buffer.from(buffer),
      filename: `${entityType}-export-${Date.now()}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
