import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReorderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  mean,
  standardDeviation,
  getZValueForServiceLevel,
} from '../utils/statistics.util';

export interface ReorderCalculation {
  avgDailyDemand: number;
  demandStdDev: number;
  safetyStock: number;
  reorderPoint: number;
  economicOrderQty: number;
  daysOfStockRemaining: number | null;
  status: ReorderStatus;
  needsReorder: boolean;
}

export interface ReorderAlert {
  itemId: string;
  itemName: string;
  sku: string;
  currentStock: number;
  reorderPoint: number;
  safetyStock: number;
  suggestedOrderQty: number;
  status: ReorderStatus;
  daysRemaining: number | null;
}

export interface DeadStockItem {
  itemId: string;
  itemName: string;
  sku: string;
  lastSaleDate: Date | null;
  daysSinceLastSale: number | null;
  currentStock: number;
  stockValue: number;
  suggestedDiscount: number;
}

@Injectable()
export class ReorderPointsService {
  private readonly logger = new Logger(ReorderPointsService.name);
  private readonly DEFAULT_SERVICE_LEVEL = 0.95;
  private readonly DEFAULT_LEAD_TIME_DAYS = 7;
  private readonly HOLDING_COST_RATE = 0.25; // 25% of item cost
  private readonly DEFAULT_ORDERING_COST = 50; // Default ordering cost
  private readonly DEAD_STOCK_DAYS = 90;

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate reorder point for daily sales history
   */
  calculateReorderPoint(
    dailySalesHistory: number[],
    leadTimeDays: number,
    serviceLevel: number = this.DEFAULT_SERVICE_LEVEL,
  ): {
    avgDailyDemand: number;
    demandStdDev: number;
    safetyStock: number;
    reorderPoint: number;
  } {
    if (dailySalesHistory.length === 0) {
      return {
        avgDailyDemand: 0,
        demandStdDev: 0,
        safetyStock: 0,
        reorderPoint: 0,
      };
    }

    const avgDailyDemand = mean(dailySalesHistory);
    const demandStdDev = standardDeviation(dailySalesHistory);

    // Safety Stock = Z × σ × √L
    // Where Z is the z-value for service level, σ is demand std dev, L is lead time
    const zScore = getZValueForServiceLevel(serviceLevel);
    const safetyStock = Math.ceil(
      zScore * demandStdDev * Math.sqrt(leadTimeDays),
    );

    // Reorder Point = (Average Daily Demand × Lead Time) + Safety Stock
    const reorderPoint = Math.ceil(avgDailyDemand * leadTimeDays + safetyStock);

    return {
      avgDailyDemand,
      demandStdDev,
      safetyStock,
      reorderPoint,
    };
  }

  /**
   * Calculate Economic Order Quantity (EOQ)
   */
  calculateEOQ(
    annualDemand: number,
    orderingCost: number,
    holdingCostPerUnit: number,
  ): number {
    if (annualDemand <= 0 || holdingCostPerUnit <= 0) {
      return 0;
    }
    // EOQ = √((2 × D × S) / H)
    // D = annual demand, S = ordering cost, H = holding cost per unit
    return Math.ceil(
      Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit),
    );
  }

  /**
   * Calculate reorder analysis for a single item
   */
  async calculateForItem(
    organizationId: string,
    itemId: string,
    leadTimeDays: number = this.DEFAULT_LEAD_TIME_DAYS,
    serviceLevel: number = this.DEFAULT_SERVICE_LEVEL,
  ): Promise<ReorderCalculation> {
    // Get item details
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, organizationId },
      select: {
        currentStock: true,
        costPrice: true,
        type: true,
      },
    });

    if (!item || item.type !== 'GOODS') {
      return {
        avgDailyDemand: 0,
        demandStdDev: 0,
        safetyStock: 0,
        reorderPoint: 0,
        economicOrderQty: 0,
        daysOfStockRemaining: null,
        status: 'OK',
        needsReorder: false,
      };
    }

    // Get daily sales history for last 90 days
    const dailySales = await this.getDemandHistory(organizationId, itemId, 90);

    // Calculate reorder point
    const { avgDailyDemand, demandStdDev, safetyStock, reorderPoint } =
      this.calculateReorderPoint(dailySales, leadTimeDays, serviceLevel);

    // Calculate EOQ
    const annualDemand = avgDailyDemand * 365;
    const holdingCostPerUnit = Number(item.costPrice) * this.HOLDING_COST_RATE;
    const economicOrderQty = this.calculateEOQ(
      annualDemand,
      this.DEFAULT_ORDERING_COST,
      holdingCostPerUnit,
    );

    // Calculate days of stock remaining
    const daysOfStockRemaining =
      avgDailyDemand > 0
        ? Math.floor(item.currentStock / avgDailyDemand)
        : null;

    // Determine status
    const status = this.determineStatus(
      item.currentStock,
      reorderPoint,
      safetyStock,
      avgDailyDemand,
    );

    const needsReorder = item.currentStock <= reorderPoint;

    return {
      avgDailyDemand,
      demandStdDev,
      safetyStock,
      reorderPoint,
      economicOrderQty,
      daysOfStockRemaining,
      status,
      needsReorder,
    };
  }

  /**
   * Calculate reorder analysis for all items in organization
   */
  async calculateForAllItems(organizationId: string): Promise<{
    calculated: number;
    failed: number;
    items: Array<{ itemId: string; status: ReorderStatus; needsReorder: boolean }>;
  }> {
    // Get all GOODS items
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        type: 'GOODS',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    let calculated = 0;
    let failed = 0;
    const results: Array<{
      itemId: string;
      status: ReorderStatus;
      needsReorder: boolean;
    }> = [];

    for (const item of items) {
      try {
        const analysis = await this.calculateForItem(
          organizationId,
          item.id,
        );
        results.push({
          itemId: item.id,
          status: analysis.status,
          needsReorder: analysis.needsReorder,
        });
        calculated++;
      } catch (error) {
        this.logger.error(
          `Failed to calculate reorder for item ${item.id}: ${error}`,
        );
        failed++;
      }
    }

    return { calculated, failed, items: results };
  }

  /**
   * Get items that need reordering
   */
  async getReorderAlerts(organizationId: string): Promise<ReorderAlert[]> {
    // Get all GOODS items with their analysis
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        type: 'GOODS',
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        currentStock: true,
        reorderPoint: true,
        costPrice: true,
        reorderAnalysis: true,
      },
    });

    const alerts: ReorderAlert[] = [];

    for (const item of items) {
      // Calculate current analysis
      const analysis = await this.calculateForItem(organizationId, item.id);

      if (analysis.needsReorder) {
        alerts.push({
          itemId: item.id,
          itemName: item.name,
          sku: item.sku,
          currentStock: item.currentStock,
          reorderPoint: analysis.reorderPoint,
          safetyStock: analysis.safetyStock,
          suggestedOrderQty: analysis.economicOrderQty,
          status: analysis.status,
          daysRemaining: analysis.daysOfStockRemaining,
        });
      }
    }

    // Sort by urgency (CRITICAL first, then by days remaining)
    alerts.sort((a, b) => {
      const statusOrder: Record<ReorderStatus, number> = {
        CRITICAL: 0,
        LOW_STOCK: 1,
        OK: 2,
        DEAD_STOCK: 3,
      };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return (a.daysRemaining || 999) - (b.daysRemaining || 999);
    });

    return alerts;
  }

  /**
   * Detect dead stock (items with no sales in N days)
   */
  async detectDeadStock(
    organizationId: string,
    thresholdDays: number = this.DEAD_STOCK_DAYS,
  ): Promise<DeadStockItem[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);

    // Get all GOODS items with stock > 0
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        type: 'GOODS',
        isActive: true,
        currentStock: { gt: 0 },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        currentStock: true,
        costPrice: true,
      },
    });

    const deadStock: DeadStockItem[] = [];

    for (const item of items) {
      // Get last sale date for this item
      const lastSale = await this.prisma.inventoryMovement.findFirst({
        where: {
          organizationId,
          itemId: item.id,
          type: 'sale',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const lastSaleDate = lastSale?.createdAt || null;
      let daysSinceLastSale: number | null = null;

      if (lastSaleDate) {
        daysSinceLastSale = Math.floor(
          (Date.now() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      // Check if dead stock (no sales or last sale > threshold)
      const isDeadStock =
        !lastSaleDate ||
        (daysSinceLastSale !== null && daysSinceLastSale >= thresholdDays);

      if (isDeadStock) {
        const stockValue = item.currentStock * Number(item.costPrice);
        const suggestedDiscount = this.calculateSuggestedDiscount(
          daysSinceLastSale,
          thresholdDays,
        );

        deadStock.push({
          itemId: item.id,
          itemName: item.name,
          sku: item.sku,
          lastSaleDate,
          daysSinceLastSale,
          currentStock: item.currentStock,
          stockValue,
          suggestedDiscount,
        });
      }
    }

    // Sort by days since last sale (longest first)
    deadStock.sort(
      (a, b) => (b.daysSinceLastSale || 999) - (a.daysSinceLastSale || 999),
    );

    return deadStock;
  }

  /**
   * Update item reorder points (for weekly cron job)
   */
  async updateItemReorderPoints(organizationId: string): Promise<{
    updated: number;
  }> {
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        type: 'GOODS',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, currentStock: true, costPrice: true },
    });

    let updated = 0;

    for (const item of items) {
      try {
        const analysis = await this.calculateForItem(organizationId, item.id);

        // Get last sale date
        const lastSale = await this.prisma.inventoryMovement.findFirst({
          where: {
            organizationId,
            itemId: item.id,
            type: 'sale',
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        const lastSaleDate = lastSale?.createdAt || null;
        let daysSinceLastSale: number | null = null;
        if (lastSaleDate) {
          daysSinceLastSale = Math.floor(
            (Date.now() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        // Upsert reorder analysis
        await this.prisma.itemReorderAnalysis.upsert({
          where: { itemId: item.id },
          update: {
            avgDailyDemand: new Decimal(analysis.avgDailyDemand),
            demandStdDev: new Decimal(analysis.demandStdDev),
            safetyStock: analysis.safetyStock,
            reorderPoint: analysis.reorderPoint,
            economicOrderQty: analysis.economicOrderQty,
            status: analysis.status,
            lastSaleDate,
            daysSinceLastSale,
            calculatedAt: new Date(),
          },
          create: {
            organizationId,
            itemId: item.id,
            avgDailyDemand: new Decimal(analysis.avgDailyDemand),
            demandStdDev: new Decimal(analysis.demandStdDev),
            leadTimeDays: this.DEFAULT_LEAD_TIME_DAYS,
            safetyStock: analysis.safetyStock,
            reorderPoint: analysis.reorderPoint,
            economicOrderQty: analysis.economicOrderQty,
            status: analysis.status,
            lastSaleDate,
            daysSinceLastSale,
          },
        });

        // Update item's reorder point field
        await this.prisma.item.update({
          where: { id: item.id },
          data: { reorderPoint: analysis.reorderPoint },
        });

        updated++;
      } catch (error) {
        this.logger.error(
          `Failed to update reorder for item ${item.id}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Updated reorder points for ${updated} items in org ${organizationId}`,
    );

    return { updated };
  }

  /**
   * Get demand history (daily sales) for an item
   */
  private async getDemandHistory(
    organizationId: string,
    itemId: string,
    days: number = 90,
  ): Promise<number[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get all sales movements for this item
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        itemId,
        type: 'sale',
        createdAt: { gte: startDate },
      },
      select: {
        quantity: true,
        createdAt: true,
      },
    });

    // Aggregate by day
    const dailySales: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      dailySales[dateKey] = 0;
    }

    // Add actual sales (negative quantity for sales)
    for (const movement of movements) {
      const dateKey = movement.createdAt.toISOString().split('T')[0];
      dailySales[dateKey] =
        (dailySales[dateKey] || 0) + Math.abs(parseFloat(movement.quantity.toString()));
    }

    return Object.values(dailySales);
  }

  /**
   * Determine reorder status based on stock levels
   */
  private determineStatus(
    currentStock: number,
    reorderPoint: number,
    safetyStock: number,
    avgDailyDemand: number,
  ): ReorderStatus {
    // Dead stock if no demand
    if (avgDailyDemand === 0 && currentStock > 0) {
      return 'DEAD_STOCK';
    }

    // Critical if below safety stock
    if (currentStock <= safetyStock) {
      return 'CRITICAL';
    }

    // Low stock if below reorder point
    if (currentStock <= reorderPoint) {
      return 'LOW_STOCK';
    }

    return 'OK';
  }

  /**
   * Calculate suggested discount for dead stock
   */
  private calculateSuggestedDiscount(
    daysSinceLastSale: number | null,
    thresholdDays: number,
  ): number {
    if (daysSinceLastSale === null) return 30; // 30% for items never sold

    // Base discount: 10% for items just past threshold
    // Increase by 5% for each additional 30 days
    const additionalPeriods = Math.floor(
      (daysSinceLastSale - thresholdDays) / 30,
    );
    const discount = Math.min(10 + additionalPeriods * 5, 50); // Max 50%

    return discount;
  }

  /**
   * Get reorder analysis summary for dashboard
   */
  async getReorderSummary(organizationId: string): Promise<{
    totalItems: number;
    needsReorder: number;
    criticalCount: number;
    lowStockCount: number;
    deadStockCount: number;
    totalDeadStockValue: number;
  }> {
    const items = await this.prisma.itemReorderAnalysis.findMany({
      where: { organizationId },
      select: { status: true },
    });

    const deadStock = await this.detectDeadStock(organizationId);

    const statusCounts = {
      CRITICAL: 0,
      LOW_STOCK: 0,
      OK: 0,
      DEAD_STOCK: 0,
    };

    for (const item of items) {
      statusCounts[item.status]++;
    }

    return {
      totalItems: items.length,
      needsReorder: statusCounts.CRITICAL + statusCounts.LOW_STOCK,
      criticalCount: statusCounts.CRITICAL,
      lowStockCount: statusCounts.LOW_STOCK,
      deadStockCount: deadStock.length,
      totalDeadStockValue: deadStock.reduce((sum, d) => sum + d.stockValue, 0),
    };
  }
}
