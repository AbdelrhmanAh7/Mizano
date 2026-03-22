import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { mean, standardDeviation } from '../utils/statistics.util';
import { Decimal } from '@prisma/client/runtime/library';
import { BoundedCache } from '../utils/bounded-cache.util';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  buildPaymentPredictionPrompt,
  PaymentPredictionResponse,
} from '../prompts/forecasting.prompts';
import { PredictionMethod } from '../types/prediction-method.type';

interface InvoiceWithCustomer {
  id: string;
  invoiceNumber: string;
  customerId: string;
  date: Date;
  dueDate: Date;
  grandTotal: Decimal;
  customer: {
    id: string;
    name: string;
    paymentTerms: number | null;
  } | null;
}

export interface CustomerPaymentProfile {
  customerId: string;
  customerName: string;
  avgDaysToPayment: number;
  stdDevDaysToPayment: number;
  paymentCount: number;
  onTimeRate: number;
  trend: 'improving' | 'stable' | 'worsening';
  lastUpdated: Date;
}

export interface PaymentPrediction {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  dueDate: Date;
  predictedDate: Date;
  daysFromNow: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'statistical' | 'payment_terms';
  factors: {
    historical: number;
    amount: number;
    dayOfWeek: number;
    monthEnd: number;
  };
  collectionPriority?: 'HIGH' | 'MEDIUM' | 'LOW';
  predictionMethod: PredictionMethod;
}

export interface CollectionPriorityItem {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  dueDate: Date;
  predictedPaymentDate: Date;
  daysOverdue: number;
  priorityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
}

interface PaymentHistoryRecord {
  invoiceId: string;
  invoiceDate: Date;
  dueDate: Date;
  paidDate: Date;
  amount: number;
  daysToPayment: number;
  daysAfterDue: number;
}

@Injectable()
export class PaymentPredictionService {
  private readonly logger = new Logger(PaymentPredictionService.name);

  // Cache for customer profiles (bounded: max 200 profiles, 30min TTL)
  private profileCache = new BoundedCache<CustomerPaymentProfile>(200, 30 * 60 * 1000);

  // Minimum history for statistical prediction
  private readonly MIN_HISTORY_FOR_STATISTICAL = 3;

  constructor(
    private prisma: PrismaService,
    private ollamaGateway: OllamaInferenceGateway,
  ) {}

  /**
   * Predict payment date for a specific invoice
   */
  async predictPaymentDate(
    organizationId: string,
    invoiceId: string,
    options?: { skipAiEnrichment?: boolean },
  ): Promise<PaymentPrediction | null> {
    // Get invoice with customer
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
      include: {
        customer: { select: { id: true, name: true, paymentTerms: true } },
      },
    });

    if (!invoice || !invoice.customer) {
      return null;
    }

    // Get payment history for this customer
    const history = await this.getPaymentHistory(organizationId, invoice.customerId);

    // Calculate statistical prediction
    const prediction = this.calculatePrediction(invoice, history);

    // Try Ollama for collection priority recommendation (skip when called from batch/forecasting)
    if (!options?.skipAiEnrichment) {
      try {
        const daysToPayArray = history.map((h) => h.daysToPayment);
        const avgDays = daysToPayArray.length > 0 ? mean(daysToPayArray) : 30;
        const onTimeCount = history.filter((h) => h.daysAfterDue <= 0).length;
        const onTimeRate = history.length > 0 ? onTimeCount / history.length : 0;

        const today = new Date();
        const daysOutstanding = Math.floor(
          (today.getTime() - new Date(invoice.date).getTime()) / (1000 * 60 * 60 * 24),
        );

        const promptData = buildPaymentPredictionPrompt(
          {
            invoice_id: invoice.id,
            invoice_number: invoice.invoiceNumber,
            customer_id: invoice.customerId,
            customer_name: invoice.customer?.name || 'Unknown',
            amount: Number(invoice.grandTotal),
            issue_date: new Date(invoice.date).toISOString().split('T')[0],
            due_date: new Date(invoice.dueDate).toISOString().split('T')[0],
            days_outstanding: daysOutstanding,
          },
          {
            avg_days_to_pay: avgDays,
            on_time_payment_rate: onTimeRate,
            total_invoices: history.length,
            total_paid: history.length,
            total_outstanding: Number(invoice.grandTotal),
            recent_payments: history.slice(0, 5).map((h) => ({
              invoice_amount: h.amount,
              days_to_pay: h.daysToPayment,
              date: h.paidDate.toISOString().split('T')[0],
            })),
          },
        );

        const ollamaResult = await this.ollamaGateway.infer<PaymentPredictionResponse>(
          promptData.user,
          { systemPrompt: promptData.system },
        );

        if (ollamaResult?.data) {
          prediction.collectionPriority = ollamaResult.data.collection_priority || undefined;
          prediction.predictionMethod = 'HYBRID';
        }
      } catch (error) {
        this.logger.debug(
          `Ollama collection priority unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return prediction;
  }

  /**
   * Predict payment dates for all outstanding invoices
   */
  async predictAllOutstanding(organizationId: string): Promise<PaymentPrediction[]> {
    // Get all outstanding invoices
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
      },
      include: {
        customer: { select: { id: true, name: true, paymentTerms: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Group by customer for efficient history fetching
    const customerIds = [...new Set(invoices.map((i) => i.customerId))];
    const historyByCustomer = new Map<string, PaymentHistoryRecord[]>();

    for (const customerId of customerIds) {
      const history = await this.getPaymentHistory(organizationId, customerId);
      historyByCustomer.set(customerId, history);
    }

    // Calculate predictions
    const predictions: PaymentPrediction[] = [];

    for (const invoice of invoices) {
      const history = historyByCustomer.get(invoice.customerId) || [];
      const prediction = this.calculatePrediction(invoice, history);
      if (prediction) {
        predictions.push(prediction);
      }
    }

    // Sort by predicted date
    predictions.sort((a, b) => a.predictedDate.getTime() - b.predictedDate.getTime());

    return predictions;
  }

  /**
   * Get customer payment profile
   */
  async getCustomerPaymentProfile(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerPaymentProfile | null> {
    // Check cache
    const cacheKey = `${organizationId}:${customerId}`;
    const cached = this.profileCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated.getTime() < 60 * 60 * 1000) {
      return cached;
    }

    // Get customer
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, name: true },
    });

    if (!customer) {
      return null;
    }

    // Get payment history
    const history = await this.getPaymentHistory(organizationId, customerId);

    if (history.length === 0) {
      return {
        customerId,
        customerName: customer.name,
        avgDaysToPayment: 0,
        stdDevDaysToPayment: 0,
        paymentCount: 0,
        onTimeRate: 0,
        trend: 'stable',
        lastUpdated: new Date(),
      };
    }

    const daysToPayArray = history.map((h) => h.daysToPayment);
    const avgDays = mean(daysToPayArray);
    const stdDays = standardDeviation(daysToPayArray);

    // Calculate on-time rate
    const onTimeCount = history.filter((h) => h.daysAfterDue <= 0).length;
    const onTimeRate = (onTimeCount / history.length) * 100;

    // Calculate trend (compare recent vs older)
    let trend: 'improving' | 'stable' | 'worsening' = 'stable';
    if (history.length >= 6) {
      const halfIdx = Math.floor(history.length / 2);
      const recentAvg = mean(daysToPayArray.slice(0, halfIdx));
      const olderAvg = mean(daysToPayArray.slice(halfIdx));

      if (recentAvg < olderAvg - 3) {
        trend = 'improving';
      } else if (recentAvg > olderAvg + 3) {
        trend = 'worsening';
      }
    }

    const profile: CustomerPaymentProfile = {
      customerId,
      customerName: customer.name,
      avgDaysToPayment: avgDays,
      stdDevDaysToPayment: stdDays,
      paymentCount: history.length,
      onTimeRate,
      trend,
      lastUpdated: new Date(),
    };

    // Cache the profile
    this.profileCache.set(cacheKey, profile);

    return profile;
  }

  /**
   * Get collection priority ranking
   */
  async getCollectionPriority(organizationId: string): Promise<CollectionPriorityItem[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get overdue and due soon invoices
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
      },
      include: {
        customer: { select: { id: true, name: true, paymentTerms: true } },
      },
    });

    const priorityItems: CollectionPriorityItem[] = [];

    // Pre-fetch customer data to avoid N+1 queries
    const customerIds = [...new Set(invoices.map((i) => i.customerId))];
    const profileByCustomer = new Map<string, CustomerPaymentProfile | null>();
    const historyByCustomer = new Map<string, PaymentHistoryRecord[]>();

    for (const customerId of customerIds) {
      const [profile, history] = await Promise.all([
        this.getCustomerPaymentProfile(organizationId, customerId),
        this.getPaymentHistory(organizationId, customerId),
      ]);
      profileByCustomer.set(customerId, profile);
      historyByCustomer.set(customerId, history);
    }

    for (const invoice of invoices) {
      const profile = profileByCustomer.get(invoice.customerId) || null;

      const dueDate = new Date(invoice.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      const history = historyByCustomer.get(invoice.customerId) || [];
      const prediction = this.calculatePrediction(invoice, history);

      // Calculate risk factor based on customer reliability
      const riskFactor = profile ? 1 + (1 - profile.onTimeRate / 100) : 1.5;

      // Priority score: higher is more urgent
      // Formula: (amount × daysOverdue × riskFactor) / confidence
      const amount = Number(invoice.grandTotal);
      const confidenceMultiplier =
        prediction?.confidence === 'high' ? 0.5 : prediction?.confidence === 'medium' ? 0.75 : 1;

      const priorityScore =
        daysOverdue > 0
          ? amount * daysOverdue * riskFactor * confidenceMultiplier
          : amount * riskFactor * 0.1;

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (daysOverdue > 30 || (profile && profile.onTimeRate < 50)) {
        riskLevel = 'high';
      } else if (daysOverdue > 15 || (profile && profile.onTimeRate < 70)) {
        riskLevel = 'medium';
      }

      // Recommended action
      let recommendedAction: string;
      if (riskLevel === 'high') {
        recommendedAction = 'Call customer immediately, consider escalation';
      } else if (riskLevel === 'medium') {
        recommendedAction = 'Send reminder email, follow up in 3 days';
      } else if (daysOverdue > 0) {
        recommendedAction = `Monitor - payment expected by ${prediction?.predictedDate.toLocaleDateString() || 'soon'}`;
      } else {
        recommendedAction = 'No action needed - not yet due';
      }

      priorityItems.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: invoice.customer?.name || 'Unknown',
        amount,
        dueDate,
        predictedPaymentDate: prediction?.predictedDate || dueDate,
        daysOverdue: Math.max(0, daysOverdue),
        priorityScore,
        riskLevel,
        recommendedAction,
      });
    }

    // Sort by priority score descending
    priorityItems.sort((a, b) => b.priorityScore - a.priorityScore);

    return priorityItems;
  }

  /**
   * Update predictions for all organizations (cron job)
   */
  async updatePredictions(organizationId: string): Promise<{ updated: number }> {
    // Clear cache for this org
    const keysToDelete: string[] = [];
    this.profileCache.forEach((_, key) => {
      if (key.startsWith(organizationId)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.profileCache.delete(key));

    // Recalculate predictions for outstanding invoices
    const predictions = await this.predictAllOutstanding(organizationId);

    this.logger.log(`Updated ${predictions.length} payment predictions for org ${organizationId}`);

    return { updated: predictions.length };
  }

  /**
   * Get detailed payment history with additional metrics
   */
  async getPaymentHistoryDetails(
    organizationId: string,
    customerId: string,
  ): Promise<{
    history: PaymentHistoryRecord[];
    avgDaysToPayment: number;
    stdDevDaysToPayment: number;
    onTimeRate: number;
    trend: string;
  }> {
    const history = await this.getPaymentHistory(organizationId, customerId);

    if (history.length === 0) {
      return {
        history: [],
        avgDaysToPayment: 0,
        stdDevDaysToPayment: 0,
        onTimeRate: 0,
        trend: 'stable',
      };
    }

    const daysToPayArray = history.map((h) => h.daysToPayment);
    const avgDays = mean(daysToPayArray);
    const stdDays = standardDeviation(daysToPayArray);
    const onTimeCount = history.filter((h) => h.daysAfterDue <= 0).length;
    const onTimeRate = (onTimeCount / history.length) * 100;

    // Calculate trend
    let trend = 'stable';
    if (history.length >= 6) {
      const halfIdx = Math.floor(history.length / 2);
      const recentAvg = mean(daysToPayArray.slice(0, halfIdx));
      const olderAvg = mean(daysToPayArray.slice(halfIdx));

      if (recentAvg < olderAvg - 3) {
        trend = 'improving';
      } else if (recentAvg > olderAvg + 3) {
        trend = 'worsening';
      }
    }

    return {
      history,
      avgDaysToPayment: avgDays,
      stdDevDaysToPayment: stdDays,
      onTimeRate,
      trend,
    };
  }

  // ============ PRIVATE METHODS ============

  /**
   * Get payment history for a customer
   */
  private async getPaymentHistory(
    organizationId: string,
    customerId: string,
  ): Promise<PaymentHistoryRecord[]> {
    // Get paid invoices with payment allocations
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        customerId,
        deletedAt: null,
        status: 'PAID',
      },
      include: {
        paymentAllocations: {
          include: {
            payment: { select: { date: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 50, // Last 50 paid invoices
    });

    const history: PaymentHistoryRecord[] = [];

    for (const invoice of invoices) {
      // Find the last payment date
      const payments = invoice.paymentAllocations
        .filter((a) => a.payment?.date)
        .map((a) => new Date(a.payment!.date));

      if (payments.length === 0) continue;

      const lastPaymentDate = new Date(Math.max(...payments.map((d) => d.getTime())));

      const invoiceDate = new Date(invoice.date);
      const dueDate = new Date(invoice.dueDate);

      const daysToPayment = Math.floor(
        (lastPaymentDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const daysAfterDue = Math.floor(
        (lastPaymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      history.push({
        invoiceId: invoice.id,
        invoiceDate,
        dueDate,
        paidDate: lastPaymentDate,
        amount: Number(invoice.grandTotal),
        daysToPayment,
        daysAfterDue,
      });
    }

    return history;
  }

  /**
   * Calculate prediction for an invoice
   */
  private calculatePrediction(
    invoice: InvoiceWithCustomer,
    history: PaymentHistoryRecord[],
  ): PaymentPrediction {
    const invoiceDate = new Date(invoice.date);
    const dueDate = new Date(invoice.dueDate);
    const today = new Date();

    // Default: use payment terms
    const paymentTermsDays = invoice.customer?.paymentTerms || 30;
    let predictedDate = new Date(invoiceDate);
    predictedDate.setDate(predictedDate.getDate() + paymentTermsDays);

    let method: 'statistical' | 'payment_terms' = 'payment_terms';
    let confidence: 'high' | 'medium' | 'low' = 'low';
    const factors = {
      historical: 1,
      amount: 1,
      dayOfWeek: 1,
      monthEnd: 1,
    };

    // If we have enough history, use statistical prediction
    if (history.length >= this.MIN_HISTORY_FOR_STATISTICAL) {
      method = 'statistical';

      const daysToPayArray = history.map((h) => h.daysToPayment);
      const avgDays = mean(daysToPayArray);
      const stdDays = standardDeviation(daysToPayArray);

      // Base prediction
      let predictedDays = avgDays;
      factors.historical = avgDays;

      // Amount factor: large invoices take longer
      const avgAmount = mean(history.map((h) => h.amount));
      const invoiceAmount = Number(invoice.grandTotal);
      if (invoiceAmount > avgAmount * 2) {
        factors.amount = 1.15;
        predictedDays *= factors.amount;
      }

      // Day of week factor: Friday invoices take longer
      const dayOfWeek = invoiceDate.getDay();
      if (dayOfWeek === 5) {
        // Friday
        factors.dayOfWeek = 1.1;
        predictedDays *= factors.dayOfWeek;
      }

      // Month-end factor
      const dueDay = dueDate.getDate();
      const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
      if (dueDay > lastDayOfMonth - 5) {
        factors.monthEnd = 1.05;
        predictedDays *= factors.monthEnd;
      }

      // Calculate predicted date
      predictedDate = new Date(invoiceDate);
      predictedDate.setDate(predictedDate.getDate() + Math.round(predictedDays));

      // Determine confidence based on sample size and std dev
      if (history.length >= 10 && stdDays < 5) {
        confidence = 'high';
      } else if (history.length >= 5 && stdDays < 15) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }
    }

    // Ensure predicted date is not in the past (normalize to start-of-day for comparison)
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const predictedStart = new Date(predictedDate);
    predictedStart.setHours(0, 0, 0, 0);

    if (predictedStart < todayStart) {
      predictedDate = new Date(todayStart);
      predictedDate.setDate(predictedDate.getDate() + 3);
    }

    const daysFromNow = Math.floor(
      (predictedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customer?.name || 'Unknown',
      amount: Number(invoice.grandTotal),
      dueDate,
      predictedDate,
      daysFromNow,
      confidence,
      method,
      factors,
      predictionMethod: method === 'statistical' ? 'ML' : 'RULE_BASED',
    };
  }
}
