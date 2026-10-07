import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { VatReturnDraft, VatReturnDraftException } from '@mizano/shared-types';
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
        select: { currency: true },
      });

      if (!org) {
        throw new Error('Organization not found');
      }

      const baseCurrency = org.currency;

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
        if (
          inv.currencyCode === null ||
          inv.currencyCode !== baseCurrency ||
          inv.taxAmount === null
        ) {
          exceptions.push({
            id: inv.id,
            type: 'invoice',
            documentNumber: inv.invoiceNumber,
            reason:
              inv.currencyCode !== baseCurrency
                ? 'Foreign currency or missing currency'
                : 'Missing tax amount',
          });
        } else {
          outputTax = outputTax.add(inv.taxAmount);
        }
      }

      for (const bill of bills) {
        if (
          bill.currencyCode === null ||
          bill.currencyCode !== baseCurrency ||
          bill.taxAmount === null
        ) {
          exceptions.push({
            id: bill.id,
            type: 'bill',
            documentNumber: bill.billNumber,
            reason:
              bill.currencyCode !== baseCurrency
                ? 'Foreign currency or missing currency'
                : 'Missing tax amount',
          });
        } else {
          inputTax = inputTax.add(bill.taxAmount);
        }
      }

      const netPayable = outputTax.sub(inputTax);

      return {
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
}
