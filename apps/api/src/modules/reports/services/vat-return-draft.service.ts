import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  VatReturnDraft,
  VatReturnDraftException,
  VatFilingCorrectionsMetric,
} from '@mizano/shared-types';
import { AuditAction, VATReturnStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describeError } from '../../../common/utils/redact';
import { derivePeriodLabel } from '../../tax/services/vat-returns.service';
import { RecordVatFilingCorrectionDto } from '../dto/vat-filing-correction.dto';

@Injectable()
export class VatReturnDraftService {
  private readonly logger = new Logger(VatReturnDraftService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async resolveActorUserId(orgId: string, candidateUserId?: string): Promise<string> {
    if (candidateUserId) {
      const user = await this.prisma.user.findFirst({
        where: { id: candidateUserId, organizationId: orgId },
        select: { id: true },
      });
      if (user) return user.id;
    }
    const fallbackUser = await this.prisma.user.findFirst({
      where: { organizationId: orgId },
      select: { id: true },
    });
    if (!fallbackUser) {
      throw new NotFoundException('No user found for organization');
    }
    return fallbackUser.id;
  }

  async getDraft(
    orgId: string,
    fromDate: string,
    toDate: string,
    userId?: string,
  ): Promise<VatReturnDraft> {
    try {
      const from = new Date(fromDate);
      const to = new Date(toDate);

      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { currency: true },
      });

      if (!org) {
        throw new NotFoundException('Organization not found');
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

      let outputTax = new Decimal(0);
      let inputTax = new Decimal(0);
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
      const draftStatus = exceptions.length > 0 ? 'incomplete' : 'complete';

      // Record draft generation event (Issue #120 instrumentation)
      // Minimum events needed: period, status, timestamps. NO invoice text or PII.
      try {
        const actorUserId = await this.resolveActorUserId(orgId, userId);
        const periodLabel = derivePeriodLabel(from, to);
        await this.prisma.auditLog.create({
          data: {
            organizationId: orgId,
            userId: actorUserId,
            action: AuditAction.CREATE,
            entityType: 'VAT_RETURN_DRAFT_EVENT',
            entityId: `${orgId}:${periodLabel}`,
            newValues: {
              period: periodLabel,
              from: from.toISOString(),
              to: to.toISOString(),
              status: draftStatus,
              exceptionCount: exceptions.length,
            },
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to record VAT return draft event: ${describeError(err)}`);
      }

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        status: draftStatus,
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

  async recordCorrection(
    orgId: string,
    userId: string | undefined,
    dto: RecordVatFilingCorrectionDto,
  ): Promise<{ success: boolean; period: string }> {
    const actorUserId = await this.resolveActorUserId(orgId, userId);
    const period = dto.period.trim();

    // Record correction event in AuditLog (Issue #120 instrumentation)
    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: actorUserId,
        action: AuditAction.CREATE,
        entityType: 'VAT_RETURN_CORRECTION_EVENT',
        entityId: `${orgId}:${period}:${Date.now()}`,
        newValues: {
          period,
          reason: dto.reason || 'correction',
        },
      },
    });

    return { success: true, period };
  }

  async getFilingCorrectionsMetric(orgId: string): Promise<VatFilingCorrectionsMetric> {
    const filedReturns = await this.prisma.vATReturn.findMany({
      where: {
        organizationId: orgId,
        status: VATReturnStatus.FILED,
        deletedAt: null,
      },
      orderBy: { startDate: 'asc' },
    });

    // Note: Do not invent a baseline; report "no data" until real filings exist.
    if (filedReturns.length === 0) {
      return {
        status: 'no data',
        hasData: false,
        message: 'No filed VAT return periods found for organization',
        filedPeriodsCount: 0,
        withDraft: {
          filedPeriods: 0,
          correctionsCount: 0,
          correctionRate: null,
          completeDraftCount: 0,
          incompleteDraftCount: 0,
        },
        withoutDraft: {
          filedPeriods: 0,
          correctionsCount: 0,
          correctionRate: null,
        },
        comparison: {
          reductionRate: null,
          reductionPercentage: null,
        },
      };
    }

    const draftEvents = await this.prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        entityType: 'VAT_RETURN_DRAFT_EVENT',
      },
      orderBy: { createdAt: 'asc' },
    });

    const correctionEvents = await this.prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        entityType: 'VAT_RETURN_CORRECTION_EVENT',
      },
      orderBy: { createdAt: 'asc' },
    });

    let withDraftFiled = 0;
    let withDraftCorrections = 0;
    let completeDraftCount = 0;
    let incompleteDraftCount = 0;

    let withoutDraftFiled = 0;
    let withoutDraftCorrections = 0;

    for (const ret of filedReturns) {
      const filedTime = ret.filedAt || ret.updatedAt || new Date();
      const periodLabel = ret.period;

      // Find draft events generated for this period prior to filing
      const preFilingDrafts = draftEvents.filter((e) => {
        const payload = e.newValues as Record<string, unknown> | null;
        if (!payload) return false;
        const draftFrom = payload.from ? String(payload.from).slice(0, 10) : '';
        const draftPeriod = String(payload.period || '');

        const matchesPeriod =
          draftPeriod === periodLabel ||
          (draftFrom && periodLabel.startsWith(draftFrom.slice(0, 7))) ||
          (draftPeriod && periodLabel.startsWith(draftPeriod.slice(0, 7))) ||
          (payload.from &&
            payload.to &&
            derivePeriodLabel(new Date(String(payload.from)), new Date(String(payload.to))) ===
              periodLabel);
        return matchesPeriod && e.createdAt <= filedTime;
      });

      // Count corrections recorded for this period
      const periodCorrections = correctionEvents.filter((c) => {
        const payload = c.newValues as Record<string, unknown> | null;
        return payload?.period === periodLabel;
      }).length;

      if (preFilingDrafts.length > 0) {
        withDraftFiled++;
        withDraftCorrections += periodCorrections;
        const latestDraft = preFilingDrafts[preFilingDrafts.length - 1];
        const latestStatus = (latestDraft.newValues as Record<string, unknown>)?.status;
        if (latestStatus === 'complete') {
          completeDraftCount++;
        } else if (latestStatus === 'incomplete') {
          incompleteDraftCount++;
        }
      } else {
        withoutDraftFiled++;
        withoutDraftCorrections += periodCorrections;
      }
    }

    const withDraftRate =
      withDraftFiled > 0
        ? new Decimal(withDraftCorrections).dividedBy(withDraftFiled).toFixed(4)
        : null;

    const withoutDraftRate =
      withoutDraftFiled > 0
        ? new Decimal(withoutDraftCorrections).dividedBy(withoutDraftFiled).toFixed(4)
        : null;

    let reductionRate: string | null = null;
    let reductionPercentage: string | null = null;

    if (withDraftRate !== null && withoutDraftRate !== null) {
      const diff = new Decimal(withoutDraftRate).minus(new Decimal(withDraftRate));
      reductionRate = diff.toFixed(4);
      if (new Decimal(withoutDraftRate).greaterThan(0)) {
        const pct = diff.dividedBy(new Decimal(withoutDraftRate)).times(100);
        reductionPercentage = `${pct.toFixed(2)}%`;
      }
    }

    return {
      status: 'active',
      hasData: true,
      message: 'VAT filing corrections metric calculated successfully',
      filedPeriodsCount: filedReturns.length,
      withDraft: {
        filedPeriods: withDraftFiled,
        correctionsCount: withDraftCorrections,
        correctionRate: withDraftRate,
        completeDraftCount,
        incompleteDraftCount,
      },
      withoutDraft: {
        filedPeriods: withoutDraftFiled,
        correctionsCount: withoutDraftCorrections,
        correctionRate: withoutDraftRate,
      },
      comparison: {
        reductionRate,
        reductionPercentage,
      },
    };
  }
}
