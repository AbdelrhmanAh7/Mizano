import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  VAT_RETURN_DRAFT_LABEL,
  VatReturnDraft,
  VatReturnDraftException,
} from '@mizano/shared-types';
import { Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';

@Injectable()
export class VatReturnDraftService {
  private readonly logger = new Logger(VatReturnDraftService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDraft(orgId: string, fromDate: string, toDate: string): Promise<VatReturnDraft> {
    try {
      const from = new Date(fromDate);
      const to = new Date(toDate);

      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { baseCurrency: true },
      });

      if (!org) {
        throw new Error('Organization not found');
      }

      const baseCurrency = org.baseCurrency.trim().toUpperCase();

      const invoices = await this.prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          date: { gte: from, lte: to },
          status: { notIn: ['DRAFT', 'VOID'] },
          deletedAt: null,
        },
        select: { id: true, invoiceNumber: true, taxAmount: true, currencyCode: true },
      });

      const bills = await this.prisma.bill.findMany({
        where: {
          organizationId: orgId,
          date: { gte: from, lte: to },
          status: { notIn: ['DRAFT', 'VOID'] },
          deletedAt: null,
        },
        select: { id: true, billNumber: true, taxAmount: true, currencyCode: true },
      });

      let outputTax = new Prisma.Decimal(0);
      let inputTax = new Prisma.Decimal(0);
      const exceptions: VatReturnDraftException[] = [];

      for (const inv of invoices) {
        const reason = this.exceptionReason(inv.currencyCode, inv.taxAmount, baseCurrency);
        if (reason) {
          exceptions.push({
            id: inv.id,
            type: 'invoice',
            documentNumber: inv.invoiceNumber,
            reason,
          });
        } else if (inv.taxAmount) {
          outputTax = outputTax.add(inv.taxAmount);
        }
      }

      for (const bill of bills) {
        const reason = this.exceptionReason(bill.currencyCode, bill.taxAmount, baseCurrency);
        if (reason) {
          exceptions.push({
            id: bill.id,
            type: 'bill',
            documentNumber: bill.billNumber,
            reason,
          });
        } else if (bill.taxAmount) {
          inputTax = inputTax.add(bill.taxAmount);
        }
      }

      const netPayable = outputTax.sub(inputTax);

      return {
        label: VAT_RETURN_DRAFT_LABEL,
        from: from.toISOString(),
        to: to.toISOString(),
        status: exceptions.length > 0 ? 'incomplete' : 'complete',
        outputTax: outputTax.toFixed(4),
        inputTax: inputTax.toFixed(4),
        netPayable: netPayable.toFixed(4),
        exceptions,
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
    if (currency && currency !== baseCurrency) {
      return 'Foreign currency';
    }
    if (taxAmount === null) {
      return 'Missing tax amount';
    }
    return null;
  }
}
