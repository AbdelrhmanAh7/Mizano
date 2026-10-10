import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService) {}

  async getDraft(orgId: string, fromDate: string, toDate: string): Promise<VatReturnDraft> {
    try {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      const where = { organizationId: orgId, date: { gte: from, lte: to }, deletedAt: null };
      const lines = { select: { amount: true, taxRate: true } };

      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { baseCurrency: true },
      });
      if (!org) throw new Error('Organization not found');
      const baseCurrency = org.baseCurrency.trim().toUpperCase();

      const invoices = await this.prisma.invoice.findMany({
        where: { ...where, status: { notIn: ['DRAFT', 'VOID'] } },
        select: { id: true, invoiceNumber: true, taxAmount: true, currencyCode: true, lines },
      });
      const bills = await this.prisma.bill.findMany({
        where: { ...where, status: { notIn: ['DRAFT', 'VOID'] } },
        select: { id: true, billNumber: true, taxAmount: true, currencyCode: true, lines },
      });

      const exceptions: VatReturnDraftException[] = [];
      const etaMismatches: VatReturnDraftEtaMismatch[] = [];
      const sum = (type: 'invoice' | 'bill', docs: TaxedDocument[]): Prisma.Decimal =>
        docs.reduce((total, doc) => {
          const ref = { id: doc.id, type, documentNumber: doc.documentNumber };
          const reason = this.exceptionReason(doc.currencyCode, doc.taxAmount, baseCurrency);
          if (reason || doc.taxAmount === null) {
            exceptions.push({ ...ref, reason: reason ?? 'Missing tax amount' });
            return total;
          }
          const lineTax = this.lineTax(doc.lines);
          if (!lineTax.equals(doc.taxAmount)) {
            etaMismatches.push({
              ...ref,
              headerTax: doc.taxAmount.toFixed(4),
              lineTax: lineTax.toFixed(4),
            });
          }
          return total.add(doc.taxAmount);
        }, new Prisma.Decimal(0));

      const outputTax = sum(
        'invoice',
        invoices.map((i) => ({ ...i, documentNumber: i.invoiceNumber })),
      );
      const inputTax = sum(
        'bill',
        bills.map((b) => ({ ...b, documentNumber: b.billNumber })),
      );

      return {
        label: VAT_RETURN_DRAFT_LABEL,
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
      this.logger.error(describeError(error, { includeMessage: false }));
      throw error;
    }
  }

  /**
   * Why a document cannot be summed into the draft, or null when it can. A missing
   * `currencyCode` means the base currency (the posting guards treat it the same way);
   * a different code is never converted or added one-for-one.
   */
  private exceptionReason(
    currencyCode: string | null,
    taxAmount: Prisma.Decimal | null,
    baseCurrency: string,
  ): string | null {
    const currency = currencyCode?.trim().toUpperCase();
    if (currency && currency !== baseCurrency) return 'Foreign currency';
    if (taxAmount === null) return 'Missing tax amount';
    return null;
  }

  /**
   * Tax the ETA e-invoice recomputes from the lines: each stored net line amount × its rate,
   * rounded per line like `computeDocumentTotals`. The header must equal it or ETA rejects the
   * submission, so a difference is flagged before filing.
   */
  private lineTax(lines: TaxedDocument['lines']): Prisma.Decimal {
    return lines.reduce(
      (total, line) => total.add(round(line.amount.mul(line.taxRate).div(100))),
      new Prisma.Decimal(0),
    );
  }
}
