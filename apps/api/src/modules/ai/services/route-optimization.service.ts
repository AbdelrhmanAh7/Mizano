import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface OptimizedStop {
  deliveryId: string;
  challanNumber: string;
  customerName: string;
  city: string | null;
  state: string | null;
  country: string | null;
  sequence: number;
}

export interface RouteOptimizationResult {
  optimizedOrder: OptimizedStop[];
  estimatedSavings: string;
  totalStops: number;
  regionCount: number;
}

export interface DeliveryEstimate {
  deliveryId: string;
  challanNumber: string;
  estimatedDays: number;
  confidence: number;
  basedOnHistory: number;
}

export interface RegionAnalytics {
  region: string;
  count: number;
  avgDays: number;
}

export interface RouteAnalytics {
  totalDeliveries: number;
  byRegion: RegionAnalytics[];
  onTimeRate: number;
  avgDeliveryDays: number;
}

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Optimize delivery order using nearest-neighbor heuristic + 2-opt improvement
   */
  async optimizeRoute(
    organizationId: string,
    deliveryIds: string[],
  ): Promise<RouteOptimizationResult> {
    if (deliveryIds.length === 0) {
      return { optimizedOrder: [], estimatedSavings: '0%', totalStops: 0, regionCount: 0 };
    }

    // Get delivery challans with customer addresses
    const deliveries = await this.prisma.deliveryChallan.findMany({
      where: {
        id: { in: deliveryIds },
        organizationId,
        deletedAt: null,
      },
      include: {
        customer: {
          select: {
            name: true,
            city: true,
            billingCity: true,
            shippingCity: true,
            billingState: true,
            shippingState: true,
            billingCountry: true,
            shippingCountry: true,
            country: true,
          },
        },
      },
    });

    if (deliveries.length === 0) {
      return { optimizedOrder: [], estimatedSavings: '0%', totalStops: 0, regionCount: 0 };
    }

    // Build stop list with location info
    const stops = deliveries.map((d) => ({
      id: d.id,
      challanNumber: d.challanNumber,
      customerName: d.customer.name,
      city: d.customer.shippingCity || d.customer.billingCity || d.customer.city || null,
      state: d.customer.shippingState || d.customer.billingState || null,
      country:
        d.customer.shippingCountry || d.customer.billingCountry || d.customer.country || null,
    }));

    // Build distance matrix (using location grouping as proxy)
    const distanceMatrix = this.buildDistanceMatrix(stops);

    // Apply nearest-neighbor heuristic
    let route = this.nearestNeighbor(distanceMatrix, stops.length);

    // Improve with 2-opt
    route = this.twoOpt(route, distanceMatrix);

    // Calculate improvement estimate
    const originalDistance = this.calculateRouteDistance(
      Array.from({ length: stops.length }, (_, i) => i),
      distanceMatrix,
    );
    const optimizedDistance = this.calculateRouteDistance(route, distanceMatrix);
    const savings =
      originalDistance > 0 ? ((originalDistance - optimizedDistance) / originalDistance) * 100 : 0;

    // Count unique regions
    const regions = new Set(stops.map((s) => s.city || s.state || s.country || 'Unknown'));

    // Build optimized order
    const optimizedOrder: OptimizedStop[] = route.map((index, sequence) => ({
      deliveryId: stops[index].id,
      challanNumber: stops[index].challanNumber,
      customerName: stops[index].customerName,
      city: stops[index].city,
      state: stops[index].state,
      country: stops[index].country,
      sequence: sequence + 1,
    }));

    return {
      optimizedOrder,
      estimatedSavings: `${Math.round(savings)}%`,
      totalStops: stops.length,
      regionCount: regions.size,
    };
  }

  /**
   * Estimate delivery time based on historical data
   */
  async estimateDelivery(organizationId: string, deliveryId: string): Promise<DeliveryEstimate> {
    const delivery = await this.prisma.deliveryChallan.findFirst({
      where: { id: deliveryId, organizationId, deletedAt: null },
      include: {
        customer: {
          select: {
            shippingCity: true,
            billingCity: true,
            city: true,
            shippingState: true,
            billingState: true,
            shippingCountry: true,
            billingCountry: true,
            country: true,
          },
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    const targetCity =
      delivery.customer.shippingCity || delivery.customer.billingCity || delivery.customer.city;
    const targetState = delivery.customer.shippingState || delivery.customer.billingState;
    const targetCountry =
      delivery.customer.shippingCountry ||
      delivery.customer.billingCountry ||
      delivery.customer.country;

    // Look for historical deliveries to the same region
    const historicalDeliveries = await this.prisma.deliveryChallan.findMany({
      where: {
        organizationId,
        status: 'RETURNED', // Completed deliveries
        deletedAt: null,
      },
      include: {
        customer: {
          select: {
            shippingCity: true,
            billingCity: true,
            city: true,
            shippingState: true,
            billingState: true,
            shippingCountry: true,
            billingCountry: true,
            country: true,
          },
        },
      },
    });

    // Filter by matching location (city > state > country)
    const matchingDeliveries: { days: number; matchLevel: number }[] = [];

    for (const hd of historicalDeliveries) {
      const hdCity = hd.customer.shippingCity || hd.customer.billingCity || hd.customer.city;
      const hdState = hd.customer.shippingState || hd.customer.billingState;
      const hdCountry =
        hd.customer.shippingCountry || hd.customer.billingCountry || hd.customer.country;

      let matchLevel = 0;
      if (targetCity && hdCity && targetCity === hdCity) {
        matchLevel = 3; // City match
      } else if (targetState && hdState && targetState === hdState) {
        matchLevel = 2; // State match
      } else if (targetCountry && hdCountry && targetCountry === hdCountry) {
        matchLevel = 1; // Country match
      }

      if (matchLevel > 0 && hd.date) {
        // Estimate delivery days from creation to last update
        const createdDate = hd.createdAt;
        const endDate = hd.updatedAt;
        const days = Math.max(
          1,
          (endDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        matchingDeliveries.push({ days, matchLevel });
      }
    }

    if (matchingDeliveries.length === 0) {
      return {
        deliveryId,
        challanNumber: delivery.challanNumber,
        estimatedDays: 5, // Default estimate
        confidence: 0.2,
        basedOnHistory: 0,
      };
    }

    // Weight by match level
    const bestMatchLevel = Math.max(...matchingDeliveries.map((d) => d.matchLevel));
    const bestMatches = matchingDeliveries.filter((d) => d.matchLevel === bestMatchLevel);

    const avgDays = bestMatches.reduce((sum, d) => sum + d.days, 0) / bestMatches.length;

    // Confidence based on match level and sample size
    const baseConfidence = bestMatchLevel === 3 ? 0.8 : bestMatchLevel === 2 ? 0.6 : 0.4;
    const sampleBonus = Math.min(0.15, bestMatches.length * 0.02);
    const confidence = Math.min(0.95, baseConfidence + sampleBonus);

    return {
      deliveryId,
      challanNumber: delivery.challanNumber,
      estimatedDays: Math.round(avgDays * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      basedOnHistory: bestMatches.length,
    };
  }

  /**
   * Get delivery route analytics
   */
  async getRouteAnalytics(organizationId: string): Promise<RouteAnalytics> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const deliveries = await this.prisma.deliveryChallan.findMany({
      where: {
        organizationId,
        createdAt: { gte: sixMonthsAgo },
        deletedAt: null,
      },
      include: {
        customer: {
          select: {
            shippingCity: true,
            billingCity: true,
            city: true,
          },
        },
      },
    });

    if (deliveries.length === 0) {
      return {
        totalDeliveries: 0,
        byRegion: [],
        onTimeRate: 0,
        avgDeliveryDays: 0,
      };
    }

    // Group by region (city)
    const regionData = new Map<string, { count: number; totalDays: number }>();
    let completedCount = 0;
    let totalDeliveryDays = 0;

    for (const d of deliveries) {
      const region =
        d.customer.shippingCity || d.customer.billingCity || d.customer.city || 'Unknown';

      if (!regionData.has(region)) {
        regionData.set(region, { count: 0, totalDays: 0 });
      }
      const data = regionData.get(region)!;
      data.count++;

      // Estimate delivery time from status changes
      if (d.status === 'RETURNED' || d.status === 'ISSUED') {
        const days = Math.max(
          1,
          (d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        data.totalDays += days;
        totalDeliveryDays += days;
        completedCount++;
      }
    }

    const byRegion: RegionAnalytics[] = Array.from(regionData.entries())
      .map(([region, data]) => ({
        region,
        count: data.count,
        avgDays:
          data.totalDays > 0 && data.count > 0
            ? Math.round((data.totalDays / data.count) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // On-time rate: completed deliveries / total non-draft deliveries
    const nonDraftCount = deliveries.filter((d) => d.status !== 'DRAFT').length;
    const completedStatusCount = deliveries.filter(
      (d) => d.status === 'RETURNED' || d.status === 'ISSUED',
    ).length;
    const onTimeRate = nonDraftCount > 0 ? completedStatusCount / nonDraftCount : 0;

    const avgDeliveryDays = completedCount > 0 ? totalDeliveryDays / completedCount : 0;

    return {
      totalDeliveries: deliveries.length,
      byRegion,
      onTimeRate: Math.round(onTimeRate * 10000) / 10000,
      avgDeliveryDays: Math.round(avgDeliveryDays * 10) / 10,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Build a distance matrix based on location similarity
   * Uses city/state/country grouping as a proxy for geographic distance
   */
  private buildDistanceMatrix(
    stops: Array<{
      city: string | null;
      state: string | null;
      country: string | null;
    }>,
  ): number[][] {
    const n = stops.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let distance: number;

        if (stops[i].city && stops[j].city && stops[i].city === stops[j].city) {
          distance = 1; // Same city
        } else if (stops[i].state && stops[j].state && stops[i].state === stops[j].state) {
          distance = 5; // Same state, different city
        } else if (stops[i].country && stops[j].country && stops[i].country === stops[j].country) {
          distance = 10; // Same country, different state
        } else {
          distance = 20; // Different country or unknown
        }

        matrix[i][j] = distance;
        matrix[j][i] = distance;
      }
    }

    return matrix;
  }

  /**
   * Nearest-neighbor heuristic for initial route construction
   * Start from first stop, always go to nearest unvisited
   */
  private nearestNeighbor(distanceMatrix: number[][], n: number): number[] {
    if (n <= 1) return Array.from({ length: n }, (_, i) => i);

    const visited = new Set<number>();
    const route: number[] = [0];
    visited.add(0);

    while (route.length < n) {
      const current = route[route.length - 1];
      let nearestDist = Infinity;
      let nearest = -1;

      for (let j = 0; j < n; j++) {
        if (!visited.has(j) && distanceMatrix[current][j] < nearestDist) {
          nearestDist = distanceMatrix[current][j];
          nearest = j;
        }
      }

      if (nearest === -1) break;
      route.push(nearest);
      visited.add(nearest);
    }

    return route;
  }

  /**
   * 2-opt improvement: try swapping edges to shorten route until no improvement
   */
  private twoOpt(route: number[], distanceMatrix: number[][]): number[] {
    const n = route.length;
    if (n < 4) return route;

    let improved = true;
    let bestRoute = [...route];
    let bestDistance = this.calculateRouteDistance(bestRoute, distanceMatrix);
    let iterations = 0;
    const maxIterations = 1000;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 2; j < n; j++) {
          // Reverse the segment between i+1 and j
          const newRoute = [...bestRoute];
          let left = i + 1;
          let right = j;
          while (left < right) {
            [newRoute[left], newRoute[right]] = [newRoute[right], newRoute[left]];
            left++;
            right--;
          }

          const newDistance = this.calculateRouteDistance(newRoute, distanceMatrix);
          if (newDistance < bestDistance) {
            bestRoute = newRoute;
            bestDistance = newDistance;
            improved = true;
          }
        }
      }
    }

    return bestRoute;
  }

  /**
   * Calculate total distance of a route
   */
  private calculateRouteDistance(route: number[], distanceMatrix: number[][]): number {
    let distance = 0;
    for (let i = 0; i < route.length - 1; i++) {
      distance += distanceMatrix[route[i]][route[i + 1]];
    }
    return distance;
  }
}
