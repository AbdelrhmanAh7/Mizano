import { Injectable } from '@nestjs/common';
import { VatReturnDraft } from '@mizano/shared-types';
import { PrismaService } from '../../../prisma/prisma.service';
import { VatReturnsService } from '../../tax/services/vat-returns.service';
import { computeVatDraft } from '../../tax/utils/vat-draft-calculator';

@Injectable()
export class VatReturnDraftService {
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
    return computeVatDraft({
      prisma: this.prisma,
      vatReturnsService: this.vatReturns,
      orgId,
      periodStart: fromDate,
      periodEnd: toDate,
      fromField: 'from',
      toField: 'to',
    });
  }
}
