import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ss = require('simple-statistics');

export interface CLVResult {
  customerId: string;
  customerName: string;
  lifetimeValue: number;
  segment: 'HIGH' | 'MEDIUM' | 'LOW';
  avgOrderValue: number;
  purchaseFrequency: number;
  customerAge: number; // months
  predictedNextPurchase: number; // days
  retentionProbability: number;
  confidence: number;
}

export interface CLVSegment {
  segment: 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  totalCLV: number;
  avgCLV: number;
  percentOfCustomers: number;
  percentOfValue: number;
}

export interface CLVDistribution {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  percentile25: number;
  percentile75: number;
  totalCustomers: number;
  totalCLV: number;
}

@Injectable()
export class ClvAnalysisService {
  private readonly logger = new Logger(ClvAnalysisService.name);

  constructor(private prisma: PrismaService) {}

  async calculateCLV(organizationId: string, customerId: string): Promise<CLVResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        customerId,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        deletedAt: null,
      },
      select: { date: true, grandTotal: true },
      orderBy: { date: 'asc' },
    });

    const customerAge = Math.max(
      1,
      Math.floor((Date.now() - customer.createdAt.getTime()) / (30 * 86400000)),
    );

    if (invoices.length === 0) {
      return {
        customerId,
        customerName: customer.name,
        lifetimeValue: 0,
        segment: 'LOW',
        avgOrderValue: 0,
        purchaseFrequency: 0,
        customerAge,
        predictedNextPurchase: 0,
        retentionProbability: 0.1,
        confidence: 0.3,
      };
    }

    const amounts = invoices.map((i) => Number(i.grandTotal));
    const avgOrderValue = ss.mean(amounts);
    const purchaseFrequency = invoices.length / customerAge; // per month

    // Calculate inter-purchase intervals
    const intervals: number[] = [];
    for (let i = 1; i < invoices.length; i++) {
      const days = (invoices[i].date.getTime() - invoices[i - 1].date.getTime()) / 86400000;
      intervals.push(days);
    }
    const avgInterval = intervals.length > 0 ? ss.mean(intervals) : customerAge * 30;

    // Simplified BG/NBD: expected transactions in next 12 months
    const T = customerAge;
    const frequency = invoices.length;

    // Retention probability based on recency vs average interval
    const recencyDays = (Date.now() - invoices[invoices.length - 1].date.getTime()) / 86400000;
    const retentionProbability = Math.max(
      0.05,
      Math.min(0.99, 1 - recencyDays / (avgInterval * 3)),
    );

    // Expected future purchases in next 12 months
    const expectedPurchases12m =
      frequency > 1 ? (frequency / T) * 12 * retentionProbability : retentionProbability * 2;

    // CLV = historical value + predicted future value (12 month horizon)
    const historicalValue = amounts.reduce((a, b) => a + b, 0);
    const futureValue = expectedPurchases12m * avgOrderValue;
    const lifetimeValue = historicalValue + futureValue;

    // Predicted next purchase
    const predictedNextPurchase =
      intervals.length > 0 ? Math.max(0, avgInterval - recencyDays) : avgInterval;

    // Confidence based on data points
    const confidence = Math.min(0.95, 0.3 + invoices.length * 0.05 + (T > 6 ? 0.2 : 0));

    // Store in profile
    await this.prisma.customerAiProfile.upsert({
      where: { customerId },
      create: {
        customerId,
        organizationId,
        lifetimeValue: new Decimal(lifetimeValue),
        clvSegment: 'MEDIUM', // will be set by batch
        rfmFrequency: frequency,
        rfmMonetary: new Decimal(historicalValue),
      },
      update: {
        lifetimeValue: new Decimal(lifetimeValue),
        calculatedAt: new Date(),
      },
    });

    return {
      customerId,
      customerName: customer.name,
      lifetimeValue,
      segment: 'MEDIUM', // determined by batch segmentation
      avgOrderValue,
      purchaseFrequency,
      customerAge,
      predictedNextPurchase: Math.round(predictedNextPurchase),
      retentionProbability,
      confidence,
    };
  }

  async calculateAllCLV(
    organizationId: string,
  ): Promise<{ processed: number; bySegment: Record<string, number> }> {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });

    const clvValues: { customerId: string; clv: number }[] = [];

    for (const customer of customers) {
      try {
        const result = await this.calculateCLV(organizationId, customer.id);
        clvValues.push({ customerId: customer.id, clv: result.lifetimeValue });
      } catch (error) {
        this.logger.warn(`Failed to calculate CLV for ${customer.id}: ${error.message}`);
      }
    }

    // Segment using percentiles
    const values = clvValues.map((v) => v.clv).filter((v) => v > 0);
    if (values.length === 0) {
      return { processed: customers.length, bySegment: { HIGH: 0, MEDIUM: 0, LOW: 0 } };
    }

    const p80 = ss.quantile(values, 0.8);
    const p30 = ss.quantile(values, 0.3);
    const bySegment = { HIGH: 0, MEDIUM: 0, LOW: 0 };

    for (const item of clvValues) {
      let segment: 'HIGH' | 'MEDIUM' | 'LOW';
      if (item.clv >= p80) segment = 'HIGH';
      else if (item.clv >= p30) segment = 'MEDIUM';
      else segment = 'LOW';
      bySegment[segment]++;

      await this.prisma.customerAiProfile.updateMany({
        where: { customerId: item.customerId },
        data: { clvSegment: segment },
      });
    }

    return { processed: customers.length, bySegment };
  }

  async getSegments(organizationId: string): Promise<CLVSegment[]> {
    const profiles = await this.prisma.customerAiProfile.findMany({
      where: { organizationId },
      select: { lifetimeValue: true, clvSegment: true },
    });

    const segmentMap = new Map<string, { count: number; totalCLV: number }>();
    let totalCLV = 0;

    for (const p of profiles) {
      const seg = p.clvSegment || 'LOW';
      const val = Number(p.lifetimeValue);
      totalCLV += val;
      const existing = segmentMap.get(seg) || { count: 0, totalCLV: 0 };
      existing.count++;
      existing.totalCLV += val;
      segmentMap.set(seg, existing);
    }

    const total = profiles.length || 1;
    const totalVal = totalCLV || 1;

    return ['HIGH', 'MEDIUM', 'LOW'].map((seg) => {
      const data = segmentMap.get(seg) || { count: 0, totalCLV: 0 };
      return {
        segment: seg as 'HIGH' | 'MEDIUM' | 'LOW',
        count: data.count,
        totalCLV: data.totalCLV,
        avgCLV: data.count > 0 ? data.totalCLV / data.count : 0,
        percentOfCustomers: (data.count / total) * 100,
        percentOfValue: (data.totalCLV / totalVal) * 100,
      };
    });
  }

  async getDistribution(organizationId: string): Promise<CLVDistribution> {
    const profiles = await this.prisma.customerAiProfile.findMany({
      where: { organizationId },
      select: { lifetimeValue: true },
    });

    const values = profiles.map((p) => Number(p.lifetimeValue));

    if (values.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        percentile25: 0,
        percentile75: 0,
        totalCustomers: 0,
        totalCLV: 0,
      };
    }

    return {
      mean: ss.mean(values),
      median: ss.median(values),
      stdDev: ss.standardDeviation(values),
      min: ss.min(values),
      max: ss.max(values),
      percentile25: ss.quantile(values, 0.25),
      percentile75: ss.quantile(values, 0.75),
      totalCustomers: values.length,
      totalCLV: ss.sum(values),
    };
  }
}
