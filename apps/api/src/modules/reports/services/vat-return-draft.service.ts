import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VAT_RETURN_DRAFT_LABEL,
  VatReturnDraft,
  VatReturnDraftEtaMismatch,
  VatReturnDraftException,
} from '@mizano/shared-types';
import { PrismaService } from '../../../prisma/prisma.service';
import { describeError } from '../../../common/utils/redact';
import { round } from '../../../common/utils/document-totals';
import {
  TAXABLE_BILL_STATUSES,
  TAXABLE_INVOICE_STATUSES,
  VatReturnsService,
} from '../../tax/services/vat-returns.service';
import { MAX_DAYS, parseReportDate, startOfUtcDay, toIsoDate } from '../utils/report-utils';

/** The default 20-digit Decimal context cannot hold 17 integer digits and four decimals. */
const WideDecimal = Prisma.Decimal.clone({ precision: 40 });
const DAY_MS = 86_400_000;
/** Documents read per query while checking them; memory stays flat however long the history is. */
const SCAN_PAGE_SIZE = 500;

interface TaxedDocument {
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

  /**
   * Output and input VAT come from the posted VAT ledger lines through `VatReturnsService`
   * (invoices, bills, expenses, credit notes, vendor credits and reversals), so the draft equals
   * the return that would be created for the same dates. The posted invoices and bills of the
   * period are then checked one by one for what the ledger cannot show: header tax that differs
   * from the lines (ETA rejects it) and documents that cannot be checked.
   */
  async getDraft(orgId: string, fromDate: string, toDate: string): Promise<VatReturnDraft> {
    try {
      const { from, to } = this.resolveRange(fromDate, toDate);

      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { baseCurrency: true },
      });
      if (!org) throw new Error('Organization not found');
      const baseCurrency = org.baseCurrency.trim().toUpperCase();

      const summary = await this.vatReturns.getVatSummary(orgId, toIsoDate(from), toIsoDate(to));
      const outputTax = new WideDecimal(summary.sales.vatCollected);
      const inputTax = new WideDecimal(summary.purchases.vatPaid);

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
        if (reason) {
          exceptions.push({ ...ref, reason });
          return;
        }
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

      return {
        label: VAT_RETURN_DRAFT_LABEL,
        currency: baseCurrency,
        from: from.toISOString(),
        to: to.toISOString(),
        status: exceptions.length > 0 || etaMismatches.length > 0 ? 'incomplete' : 'complete',
        outputTax: outputTax.toFixed(4),
        inputTax: inputTax.toFixed(4),
        netPayable: outputTax.sub(inputTax).toFixed(4),
        exceptions,
        etaMismatches,
      };
    } catch (error) {
      if (!(error instanceof HttpException)) {
        this.logger.error(describeError(error, { includeMessage: false }));
      }
      throw error;
    }
  }

  /**
   * Inclusive UTC calendar days: a date-only `to` covers its whole day and a timestamp counts as
   * the day it falls in, like the VAT return dates. Longer than a year is rejected so one request
   * cannot read an unbounded history.
   */
  private resolveRange(fromDate: string, toDate: string): { from: Date; to: Date } {
    const start = parseReportDate(fromDate, 'start', 'from');
    const end = parseReportDate(toDate, 'end', 'to');
    if (!start || !end) throw new BadRequestException('from and to are required');
    const from = startOfUtcDay(start);
    const to = startOfUtcDay(end);
    if (from > to) throw new BadRequestException('from date must be before or equal to to date');
    if ((to.getTime() - from.getTime()) / DAY_MS + 1 > MAX_DAYS) {
      throw new BadRequestException(`The period must not be longer than ${MAX_DAYS} days`);
    }
    return { from, to };
  }

  /** Cursor-pages a query by id so only `SCAN_PAGE_SIZE` documents are in memory at a time. */
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

  /**
   * Why a document cannot be checked against its lines, or null when it can. A missing
   * `currencyCode` means the base currency (the posting guards treat it the same way); a
   * different code is never converted or compared one-for-one.
   */
  private exceptionReason(doc: TaxedDocument, baseCurrency: string): string | null {
    const currency = doc.currencyCode?.trim().toUpperCase();
    if (currency && currency !== baseCurrency) return 'Foreign currency';
    if (doc.taxAmount === null) return 'Missing tax amount';
    if (doc.taxAmount.isNegative()) return 'Negative tax amount';
    if (doc.lines.some((l) => l.taxRate.isNegative() || l.taxRate.greaterThan(100))) {
      return 'Invalid tax rate';
    }
    return null;
  }

  /**
   * Tax the ETA e-invoice recomputes from the lines: each stored net line amount × its rate,
   * rounded per line like `computeDocumentTotals`. The header must equal it or ETA rejects the
   * submission, so a difference is flagged before filing.
   */
  private lineTax(lines: TaxedDocument['lines']): Prisma.Decimal {
    return lines.reduce(
      (total, line) => total.add(round(new WideDecimal(line.amount).mul(line.taxRate).div(100))),
      new WideDecimal(0),
    );
  }
}
