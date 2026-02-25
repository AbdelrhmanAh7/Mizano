import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiFeedbackAction, Prisma } from '@prisma/client';

export interface VlmCorrectionData {
  /** Which extraction method was used */
  extractionMethod: 'vlm' | 'ocr';

  /** The VLM's original extraction (before user corrections) */
  originalExtraction: {
    vendorName: string | null;
    invoiceNumber: string | null;
    date: string | null;
    dueDate: string | null;
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    lineItemCount: number;
  };

  /** The user's confirmed values (after corrections) */
  confirmedValues: {
    vendorId: string;
    documentNumber: string | null;
    date: string;
    dueDate: string;
    lineCount: number;
    totalAmount: number;
  };

  /** Which specific fields were corrected */
  correctedFields: string[];

  /** Per-field confidence from the VLM */
  fieldConfidence: Record<string, number>;

  /** Accounting entry suggestion (accepted or dismissed) */
  accountingEntryAccepted: boolean;
}

export interface VlmAccuracyStats {
  totalExtractions: number;
  vlmExtractions: number;
  ocrFallbacks: number;
  averageFieldAccuracy: number;
  fieldAccuracy: Record<string, number>;
  mostCorrectedFields: string[];
}

const TRACKABLE_FIELDS = [
  'vendorName',
  'documentNumber',
  'date',
  'dueDate',
  'total',
  'subtotal',
  'tax',
  'lineItems',
] as const;

@Injectable()
export class VlmFeedbackService {
  private readonly logger = new Logger(VlmFeedbackService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log VLM extraction feedback after bill/invoice confirmation.
   * Stores both original extraction and user corrections for future analysis.
   */
  async logVlmFeedback(
    organizationId: string,
    billId: string,
    correction: VlmCorrectionData,
  ): Promise<void> {
    const totalFields = TRACKABLE_FIELDS.length;
    const accurateFields = totalFields - correction.correctedFields.length;
    const fieldAccuracy = accurateFields / totalFields;

    const action =
      correction.correctedFields.length === 0
        ? AiFeedbackAction.ACCEPTED
        : AiFeedbackAction.CORRECTED;

    await this.prisma.aiFeedback.create({
      data: {
        organizationId,
        feature: AiFeature.OCR_LAYOUT,
        userAction: action,
        aiSuggestion: {
          originalExtraction: correction.originalExtraction,
          fieldConfidence: correction.fieldConfidence,
        },
        inputData: {
          billId,
          extractionMethod: correction.extractionMethod,
          confirmedValues: correction.confirmedValues,
          correctedFields: correction.correctedFields,
          fieldAccuracy,
          accountingEntryAccepted: correction.accountingEntryAccepted,
          timestamp: new Date().toISOString(),
        },
      },
    });

    this.logger.log(
      `VLM feedback logged: method=${correction.extractionMethod}, ` +
        `corrections=${correction.correctedFields.length}, ` +
        `accuracy=${(fieldAccuracy * 100).toFixed(0)}%, ` +
        `bill=${billId}`,
    );
  }

  /**
   * Calculate VLM accuracy statistics for an organization.
   * Used for dashboard display and monitoring.
   */
  async getAccuracyStats(organizationId: string, days: number = 30): Promise<VlmAccuracyStats> {
    const feedbacks = await this.prisma.aiFeedback.findMany({
      where: {
        organizationId,
        feature: AiFeature.OCR_LAYOUT,
        createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
        inputData: { path: ['extractionMethod'], not: Prisma.JsonNull },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (feedbacks.length === 0) {
      return {
        totalExtractions: 0,
        vlmExtractions: 0,
        ocrFallbacks: 0,
        averageFieldAccuracy: 0,
        fieldAccuracy: {},
        mostCorrectedFields: [],
      };
    }

    let vlmExtractions = 0;
    let ocrFallbacks = 0;
    let totalAccuracy = 0;
    const fieldCorrectionCount: Record<string, number> = {};
    const fieldTotalCount: Record<string, number> = {};

    for (const feedback of feedbacks) {
      const meta = feedback.inputData as Record<string, any>;

      if (meta.extractionMethod === 'vlm') {
        vlmExtractions++;
      } else {
        ocrFallbacks++;
      }

      if (typeof meta.fieldAccuracy === 'number') {
        totalAccuracy += meta.fieldAccuracy;
      }

      const correctedFields: string[] = meta.correctedFields || [];
      for (const field of TRACKABLE_FIELDS) {
        fieldTotalCount[field] = (fieldTotalCount[field] || 0) + 1;
        if (correctedFields.includes(field)) {
          fieldCorrectionCount[field] = (fieldCorrectionCount[field] || 0) + 1;
        }
      }
    }

    // Per-field accuracy: % of times the field was NOT corrected
    const fieldAccuracy: Record<string, number> = {};
    for (const field of TRACKABLE_FIELDS) {
      const total = fieldTotalCount[field] || 0;
      const corrections = fieldCorrectionCount[field] || 0;
      fieldAccuracy[field] = total > 0 ? (total - corrections) / total : 1;
    }

    // Sort fields by correction frequency (most corrected first)
    const mostCorrectedFields = Object.entries(fieldCorrectionCount)
      .sort(([, a], [, b]) => b - a)
      .map(([field]) => field);

    return {
      totalExtractions: feedbacks.length,
      vlmExtractions,
      ocrFallbacks,
      averageFieldAccuracy: totalAccuracy / feedbacks.length,
      fieldAccuracy,
      mostCorrectedFields,
    };
  }
}
