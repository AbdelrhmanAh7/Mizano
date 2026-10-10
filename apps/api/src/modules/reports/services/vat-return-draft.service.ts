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
import { VatFigures } from '../../tax/services/vat-returns.service';
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

      // Normalize toDate to the end of the UTC day (23:59:59.999)
      const endOfDay = new Date(
        Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999),
      );

      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { currency: true },
      });

      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      const baseCurrency = org.currency;

      // Resolve VAT accounts (payable and receivable)
      const accounts = await this.resolveVatAccounts(orgId);

      // Compute VAT figures from posted journal movements
      const figures = await this.computeVatFigures(orgId, from, endOfDay, accounts);

      const netPayable = figures.netPayable;
      const draftStatus = figures.outputVat.equals(figures.inputVat) ? 'complete' : 'incomplete';

      // Record draft generation event (Issue #120 instrumentation)
      // Minimum events needed: period, status, timestamps. NO invoice text or PII.
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
            exceptionCount: 0, // No exceptions for figures-based draft
          },
        },
      });

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        status: draftStatus,
        outputTax: figures.outputVat.toFixed(4),
        inputTax: figures.inputVat.toFixed(4),
        netPayable: netPayable.toFixed(4),
        exceptions: [],
      };
    } catch (error) {
      this.logger.error(describeError(error, { includeMessage: false }));
      throw error;
    }
  }

  /**
   * Computes VAT figures from posted journal movements, matching the filed return calculation.
   * Handles credit notes, reversals, and historical VAT accounts.
   */
  private async computeVatFigures(
    orgId: string,
    startDate: Date,
    endExclusive: Date,
    accounts: { payableId: string; receivableId: string; outputIds: string[]; inputIds: string[] },
  ): Promise<VatFigures> {
    const start = new Date(startDate);
    const window = { gte: start, lt: endExclusive };

    // Sources that are NOT VAT activity for the period
    const VAT_NON_ACTIVITY_SOURCES: string[] = ['VAT_RETURN', 'VAT_PAYMENT', 'OPENING_BALANCE'];

    const LEGACY_OPENING = { journalNumber: 'LEGACY_OPENING', sourceType: null };

    // Aggregate VAT movements on output accounts (net credit = output VAT)
    const outputMovements = await Promise.all(
      accounts.outputIds.map(async (accountId) => {
        const { _sum } = await this.prisma.journalLine.aggregate({
          where: {
            accountId,
            journal: {
              organizationId,
              isPosted: true,
              deletedAt: null,
              date: window,
              OR: [{ sourceType: null }, { sourceType: { notIn: VAT_NON_ACTIVITY_SOURCES } }],
              NOT: LEGACY_OPENING,
              NOT: { reversalOf: { is: LEGACY_OPENING } },
            },
          },
          _sum: { debit: true, credit: true },
        });
        const debit = _sum?.debit ?? new Decimal(0);
        const credit = _sum?.credit ?? new Decimal(0);
        return { accountId, debit, credit };
      }),
    );

    // Aggregate VAT movements on input accounts (net debit = input VAT)
    const inputMovements = await Promise.all(
      accounts.inputIds.map(async (accountId) => {
        const { _sum } = await this.prisma.journalLine.aggregate({
          where: {
            accountId,
            journal: {
              organizationId,
              isPosted: true,
              deletedAt: null,
              date: window,
              OR: [{ sourceType: null }, { sourceType: { notIn: VAT_NON_ACTIVITY_SOURCES } }],
              NOT: LEGACY_OPENING,
              NOT: { reversalOf: { is: LEGACY_OPENING } },
            },
          },
          _sum: { debit: true, credit: true },
        });
        const debit = _sum?.debit ?? new Decimal(0);
        const credit = _sum?.credit ?? new Decimal(0);
        return { accountId, debit, credit };
      }),
    );

    // Credit notes (and their voids) net of VAT: Sales Returns lines
    const creditedNet = await this.prisma.journalLine.aggregate({
      where: {
        description: { endsWith: '- Sales Returns' },
        journal: {
          organizationId,
          isPosted: true,
          deletedAt: null,
          date: window,
          sourceType: { in: ['CREDIT_NOTE', 'CREDIT_NOTE_VOID'] },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const outputByAccount = outputMovements.map((m) => ({
      accountId: m.accountId,
      amount: m.credit.sub(m.debit),
    }));

    const inputByAccount = inputMovements.map((m) => ({
      accountId: m.accountId,
      amount: m.debit.sub(m.credit),
    }));

    const outputVat = outputByAccount.reduce((sum, x) => sum.add(x.amount), new Decimal(0));
    const inputVat = inputByAccount.reduce((sum, x) => sum.add(x.amount), new Decimal(0));

    return {
      outputByAccount,
      inputByAccount,
      totalSales: new Decimal(0), // Not needed for draft, only for filed returns
      outputVat,
      totalPurchases: new Decimal(0), // Not needed for draft
      inputVat,
      netPayable: outputVat.sub(inputVat),
    };
  }

  /**
   * Resolves the organization's VAT accounts (payable and receivable).
   * Includes historical accounts that carried VAT in the past.
   */
  private async resolveVatAccounts(organizationId: string): Promise<{
    payableId: string;
    receivableId: string;
    outputIds: string[];
    inputIds: string[];
  }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultVatPayableAccountId: true, defaultVatReceivableAccountId: true },
    });

    if (!org?.defaultVatPayableAccountId) {
      throw new NotFoundException('VAT Payable account not configured for this organization');
    }
    if (!org.defaultVatReceivableAccountId) {
      throw new NotFoundException('VAT Receivable account not configured for this organization');
    }
    if (org.defaultVatPayableAccountId === org.defaultVatReceivableAccountId) {
      throw new NotFoundException('VAT Payable and VAT Receivable accounts must be different');
    }

    const ids = [org.defaultVatPayableAccountId, org.defaultVatReceivableAccountId];
    const found = await this.prisma.account.count({
      where: { id: { in: ids }, organizationId, deletedAt: null },
    });
    if (found !== ids.length) {
      throw new NotFoundException('One or more VAT accounts no longer exist');
    }

    const payableId = org.defaultVatPayableAccountId;
    const receivableId = org.defaultVatReceivableAccountId;

    // Find historical VAT accounts (accounts that ever carried VAT)
    const sources: string[] = ['INVOICE_SEND', 'BILL_APPROVAL', 'CREDIT_NOTE', 'VAT_RETURN'];
    const outputHistory = await this.prisma.journalLine.findMany({
      where: {
        journal: {
          organizationId,
          isPosted: true,
          deletedAt: null,
          sourceType: { in: sources },
        },
        description: { endsWith: '- VAT Payable' },
      },
      select: { accountId: true },
      distinct: ['accountId'],
    });

    const inputHistory = await this.prisma.journalLine.findMany({
      where: {
        journal: {
          organizationId,
          isPosted: true,
          deletedAt: null,
          sourceType: { in: sources },
        },
        description: { endsWith: '- VAT Receivable' },
      },
      select: { accountId: true },
      distinct: ['accountId'],
    });

    const outputIds = [...new Set([payableId, ...outputHistory.map((l) => l.accountId)])];
    const inputIds = [...new Set([receivableId, ...inputHistory.map((l) => l.accountId)])];

    return { payableId, receivableId, outputIds, inputIds };
  }

  async recordCorrection(
    orgId: string,
    userId: string | undefined,
    dto: RecordVatFilingCorrectionDto,
  ): Promise<{ success: boolean; period: string }> {
    const actorUserId = await this.resolveActorUserId(orgId, userId);
    const period = dto.period.trim();
    const reason = dto.reason;

    // Derive a deterministic entityId from org, period, and reason to ensure idempotency
    const entityId = `${orgId}:${period}:${reason}`;

    // Try to create the correction event; if it already exists, skip it
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: actorUserId,
          action: AuditAction.CREATE,
          entityType: 'VAT_RETURN_CORRECTION_EVENT',
          entityId,
          newValues: {
            period,
            reason,
          },
        },
      });
    } catch (err: any) {
      // If the entity already exists, this is a retry; skip silently
      if (err?.code === 'P2002') {
        // Duplicate key error - this is an idempotent retry, not an error
        return { success: true, period };
      }
      throw err;
    }

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

        // Use exact period matching (YYYY-MM or YYYY-QN) to avoid false matches
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

      // Count corrections recorded AFTER the filing time (not before)
      const periodCorrections = correctionEvents.filter((c) => {
        const payload = c.newValues as Record<string, unknown> | null;
        if (!payload?.period || payload.period !== periodLabel) return false;
        return c.createdAt > filedTime;
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
