import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VAT_RETURN_DRAFT_LABEL,
  VatReturnDraft,
  VatReturnDraftEtaMismatch,
  VatReturnDraftException,
  VatReturnDraftMismatch,
} from '@mizano/shared-types';
import { PrismaService } from '../../../prisma/prisma.service';
import { describeError } from '../../../common/utils/redact';
import { round } from '../../../common/utils/document-totals';
import {
  TAXABLE_BILL_STATUSES,
  TAXABLE_INVOICE_STATUSES,
  VatReturnsService,
} from '../../tax/services/vat-returns.service';
import {
  MAX_DAYS,
  parseReportDate,
  startOfUtcDay,
  toIsoDate,
} from '../../../common/utils/report-utils';

const WideDecimal = Prisma.Decimal.clone({ precision: 40 });
const DAY_MS = 86_400_000;
const SCAN_PAGE_SIZE = 500;

export interface TaxedDocument {
  id: string;
  documentNumber: string;
  taxAmount: Prisma.Decimal | null;
  currencyCode: string | null;
  lines: Array<{ amount: Prisma.Decimal; taxRate: Prisma.Decimal }>;
}

@Injectable()
export class VatReturnDraftService {
  private readonly logger = new Logger(VatReturnDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vatReturns: VatReturnsService,
  ) {}

  async getDraft(orgId: string, fromDate: string, toDate: string): Promise<VatReturnDraft> {
    try {
      const { from, to } = this.resolveRange(fromDate, toDate);
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { baseCurrency: true },
      });
      if (!org) throw new BadRequestException('Organization not found');
      const baseCurrency = org.baseCurrency.trim().toUpperCase();

      const summary = await this.vatReturns.getVatSummary(orgId, toIsoDate(from), toIsoDate(to));
      const outputVat = new WideDecimal(summary.sales.vatCollected);
      const inputVat = new WideDecimal(summary.purchases.vatPaid);
      const netVat = outputVat.sub(inputVat);
      const where = {
        organizationId: orgId,
        deletedAt: null,
        date: { gte: from, lt: new Date(to.getTime() + DAY_MS) },
      };
      const exceptions: VatReturnDraftException[] = [];
      const etaMismatches: VatReturnDraftEtaMismatch[] = [];

      const check = (type: 'invoice' | 'bill', doc: TaxedDocument): void => {
        const ref = { id: doc.id, type, documentNumber: doc.documentNumber };
        const reason = this.exceptionReason(doc, baseCurrency);
        if (reason) return void exceptions.push({ ...ref, reason });
        const lineTax = this.lineTax(doc.lines);
        if (doc.taxAmount && !lineTax.equals(doc.taxAmount)) {
          etaMismatches.push({
            ...ref,
            headerTax: doc.taxAmount.toFixed(4),
            lineTax: lineTax.toFixed(4),
          });
        }
      };

      const lines = { select: { amount: true, taxRate: true } };
      await this.scan(
        (page) =>
          this.prisma.invoice.findMany({
            where: { ...where, status: { in: TAXABLE_INVOICE_STATUSES } },
            select: { id: true, invoiceNumber: true, taxAmount: true, currencyCode: true, lines },
            orderBy: { id: 'asc' },
            ...page,
          }),
        (invoice) => check('invoice', { ...invoice, documentNumber: invoice.invoiceNumber }),
      );
      await this.scan(
        (page) =>
          this.prisma.bill.findMany({
            where: { ...where, status: { in: TAXABLE_BILL_STATUSES } },
            select: { id: true, billNumber: true, taxAmount: true, currencyCode: true, lines },
            orderBy: { id: 'asc' },
            ...page,
          }),
        (bill) => check('bill', { ...bill, documentNumber: bill.billNumber }),
      );

      const storedReturn = await this.prisma.vATReturn.findFirst({
        where: { organizationId: orgId, deletedAt: null, startDate: from, endDate: to },
      });
      const mismatches: VatReturnDraftMismatch[] = [];
      if (storedReturn) {
        const stored = storedReturn as { netPayable?: Prisma.Decimal; totalVat?: Prisma.Decimal };
        const recordedNet = stored.netPayable ?? stored.totalVat;
        if (recordedNet !== undefined && !new WideDecimal(recordedNet).equals(netVat)) {
          mismatches.push({
            field: 'netVat',
            computed: netVat.toFixed(4),
            recorded: new WideDecimal(recordedNet).toFixed(4),
          });
        }
      }

      return {
        label: VAT_RETURN_DRAFT_LABEL,
        currency: baseCurrency,
        from: from.toISOString(),
        to: to.toISOString(),
        periodStart: toIsoDate(from),
        periodEnd: toIsoDate(to),
        status:
          exceptions.length > 0 || etaMismatches.length > 0 || mismatches.length > 0
            ? 'incomplete'
            : 'complete',
        outputVat: outputVat.toFixed(4),
        inputVat: inputVat.toFixed(4),
        netVat: netVat.toFixed(4),
        outputTax: outputVat.toFixed(4),
        inputTax: inputVat.toFixed(4),
        netPayable: netVat.toFixed(4),
        totalSales: summary.sales.total,
        totalPurchases: summary.purchases.totalPurchases,
        mismatches,
        exceptions,
        etaMismatches,
      };
    } catch (error) {
      if (!(error instanceof HttpException))
        this.logger.error(describeError(error, { includeMessage: false }));
      throw error;
    }
  }

  private resolveRange(fromDate: string, toDate: string): { from: Date; to: Date } {
    const start = parseReportDate(fromDate, 'start', 'from');
    const end = parseReportDate(toDate, 'end', 'to');
    if (!start || !end) throw new BadRequestException('from and to are required');
    const from = startOfUtcDay(start);
    const to = startOfUtcDay(end);
    if (from > to) throw new BadRequestException('from date must be before or equal to to date');
    if ((to.getTime() - from.getTime()) / DAY_MS + 1 > MAX_DAYS)
      throw new BadRequestException(`The period must not be longer than ${MAX_DAYS} days`);
    return { from, to };
  }

  private async scan<T extends { id: string }>(
    fetchPage: (page: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
    visit: (doc: T) => void,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const page = await fetchPage(
        cursor
          ? { take: SCAN_PAGE_SIZE, cursor: { id: cursor }, skip: 1 }
          : { take: SCAN_PAGE_SIZE },
      );
      page.forEach(visit);
      if (page.length < SCAN_PAGE_SIZE) return;
      cursor = page[page.length - 1].id;
    }
  }

  private exceptionReason(doc: TaxedDocument, baseCurrency: string): string | null {
    const currency = doc.currencyCode?.trim().toUpperCase();
    if (currency && currency !== baseCurrency) return 'Foreign currency';
    if (doc.taxAmount === null) return 'Missing tax amount';
    if (doc.taxAmount.isNegative()) return 'Negative tax amount';
    if (doc.lines.some((l) => l.taxRate.isNegative() || l.taxRate.greaterThan(100)))
      return 'Invalid tax rate';
    return null;
  }

  private lineTax(lines: TaxedDocument['lines']): Prisma.Decimal {
    return lines.reduce(
      (total, line) => total.add(round(new WideDecimal(line.amount).mul(line.taxRate).div(100))),
      new WideDecimal(0),
    );
  }
}
