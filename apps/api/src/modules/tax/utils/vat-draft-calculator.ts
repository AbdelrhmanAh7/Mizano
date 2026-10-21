import { BadRequestException, HttpException, Logger } from '@nestjs/common';
import { Prisma, VATReturn } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
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
} from '../services/vat-returns.service';
import { parseReportDate, startOfUtcDay, toIsoDate } from '../../reports/utils/report-utils';

export const WideDecimal = Prisma.Decimal.clone({ precision: 40 });
export const DAY_MS = 86_400_000;
export const MAX_DAYS = 366;
export const SCAN_PAGE_SIZE = 500;

export interface TaxedDocument {
  id: string;
  documentNumber: string;
  taxAmount: Decimal | null;
  currencyCode: string | null;
  lines: Array<{ amount: Decimal; taxRate: Decimal }>;
}

export function resolveDraftRange(fromDate: string, toDate: string): { from: Date; to: Date } {
  const start = parseReportDate(fromDate, 'start', 'periodStart');
  const end = parseReportDate(toDate, 'end', 'periodEnd');
  if (!start || !end) {
    throw new BadRequestException('periodStart and periodEnd are required');
  }
  const from = startOfUtcDay(start);
  const to = startOfUtcDay(end);
  if (from > to) {
    throw new BadRequestException('periodStart must be before or equal to periodEnd');
  }
  if ((to.getTime() - from.getTime()) / DAY_MS + 1 > MAX_DAYS) {
    throw new BadRequestException(`The period must not be longer than ${MAX_DAYS} days`);
  }
  return { from, to };
}

export function exceptionReason(doc: TaxedDocument, baseCurrency: string): string | null {
  const currency = doc.currencyCode?.trim().toUpperCase();
  if (currency && currency !== baseCurrency) return 'Foreign currency';
  if (doc.taxAmount === null) return 'Missing tax amount';
  if (doc.taxAmount.isNegative()) return 'Negative tax amount';
  if (doc.lines.some((l) => l.taxRate.isNegative() || l.taxRate.greaterThan(100))) {
    return 'Invalid tax rate';
  }
  return null;
}

export function lineTax(lines: TaxedDocument['lines']): Decimal {
  return lines.reduce(
    (total, line) => total.add(round(new WideDecimal(line.amount).mul(line.taxRate).div(100))),
    new WideDecimal(0),
  );
}

export async function scanDocuments<T extends { id: string }>(
  fetchPage: (page: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  visit: (doc: T) => void,
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const docs = await fetchPage(
      cursor ? { take: SCAN_PAGE_SIZE, cursor: { id: cursor }, skip: 1 } : { take: SCAN_PAGE_SIZE },
    );
    docs.forEach(visit);
    if (docs.length < SCAN_PAGE_SIZE) return;
    cursor = docs[docs.length - 1].id;
  }
}

export async function computeVatDraft(params: {
  prisma: PrismaService;
  vatReturnsService: Pick<VatReturnsService, 'getVatSummary'>;
  orgId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<VatReturnDraft> {
  const logger = new Logger('VatReturnDraft');
  try {
    const { from, to } = resolveDraftRange(params.periodStart, params.periodEnd);
    const org = await params.prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { baseCurrency: true },
    });
    if (!org) throw new BadRequestException('Organization not found');
    const baseCurrency = org.baseCurrency.trim().toUpperCase();

    const summary = await params.vatReturnsService.getVatSummary(
      params.orgId,
      toIsoDate(from),
      toIsoDate(to),
    );
    const outputVat = new WideDecimal(summary.sales.vatCollected);
    const inputVat = new WideDecimal(summary.purchases.vatPaid);
    const totalSales = new WideDecimal(summary.sales?.total ?? '0');
    const purchasesRecord = summary.purchases as { totalPurchases?: string; total?: string };
    const totalPurchases = new WideDecimal(
      purchasesRecord?.totalPurchases ?? purchasesRecord?.total ?? '0',
    );
    const netVat = outputVat.sub(inputVat);

    const window = { gte: from, lt: new Date(to.getTime() + DAY_MS) };
    const where = { organizationId: params.orgId, deletedAt: null, date: window };
    const exceptions: VatReturnDraftException[] = [];
    const etaMismatches: VatReturnDraftEtaMismatch[] = [];

    const check = (type: 'invoice' | 'bill', doc: TaxedDocument): void => {
      const ref = { id: doc.id, type, documentNumber: doc.documentNumber };
      const reason = exceptionReason(doc, baseCurrency);
      if (reason) {
        exceptions.push({ ...ref, reason });
        return;
      }
      const docLineTax = lineTax(doc.lines);
      if (doc.taxAmount && !docLineTax.equals(doc.taxAmount)) {
        etaMismatches.push({
          ...ref,
          headerTax: doc.taxAmount.toFixed(4),
          lineTax: docLineTax.toFixed(4),
        });
      }
    };

    const lines = { select: { amount: true, taxRate: true } };
    await scanDocuments(
      (page) =>
        params.prisma.invoice.findMany({
          where: { ...where, status: { in: TAXABLE_INVOICE_STATUSES } },
          select: { id: true, invoiceNumber: true, taxAmount: true, currencyCode: true, lines },
          orderBy: { id: 'asc' },
          ...page,
        }),
      (inv) => check('invoice', { ...inv, documentNumber: inv.invoiceNumber }),
    );
    await scanDocuments(
      (page) =>
        params.prisma.bill.findMany({
          where: { ...where, status: { in: TAXABLE_BILL_STATUSES } },
          select: { id: true, billNumber: true, taxAmount: true, currencyCode: true, lines },
          orderBy: { id: 'asc' },
          ...page,
        }),
      (bill) => check('bill', { ...bill, documentNumber: bill.billNumber }),
    );

    const storedReturn: VATReturn | null = await params.prisma.vATReturn.findFirst({
      where: { organizationId: params.orgId, deletedAt: null, startDate: from, endDate: to },
    });

    const mismatches: VatReturnDraftMismatch[] = [];
    if (storedReturn) {
      const recordedNet = storedReturn.netPayable;
      if (recordedNet != null && !new WideDecimal(recordedNet).equals(netVat)) {
        mismatches.push({
          field: 'netVat',
          computed: netVat.toFixed(4),
          recorded: new WideDecimal(recordedNet).toFixed(4),
        });
      }
      const recordedOutput = storedReturn.outputVAT;
      if (recordedOutput != null && !new WideDecimal(recordedOutput).equals(outputVat)) {
        mismatches.push({
          field: 'outputVat',
          computed: outputVat.toFixed(4),
          recorded: new WideDecimal(recordedOutput).toFixed(4),
        });
      }
      const recordedInput = storedReturn.inputVAT;
      if (recordedInput != null && !new WideDecimal(recordedInput).equals(inputVat)) {
        mismatches.push({
          field: 'inputVat',
          computed: inputVat.toFixed(4),
          recorded: new WideDecimal(recordedInput).toFixed(4),
        });
      }
      if (
        storedReturn.totalSales != null &&
        !new WideDecimal(storedReturn.totalSales).equals(totalSales)
      ) {
        mismatches.push({
          field: 'totalSales',
          computed: totalSales.toFixed(4),
          recorded: new WideDecimal(storedReturn.totalSales).toFixed(4),
        });
      }
      if (
        storedReturn.totalPurchases != null &&
        !new WideDecimal(storedReturn.totalPurchases).equals(totalPurchases)
      ) {
        mismatches.push({
          field: 'totalPurchases',
          computed: totalPurchases.toFixed(4),
          recorded: new WideDecimal(storedReturn.totalPurchases).toFixed(4),
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
      totalSales: totalSales.toFixed(4),
      totalPurchases: totalPurchases.toFixed(4),
      mismatches,
      exceptions,
      etaMismatches,
    };
  } catch (error) {
    if (!(error instanceof HttpException)) {
      logger.error(describeError(error, { includeMessage: false }));
    }
    throw error;
  }
}
