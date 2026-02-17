import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiTrainingService } from './ai-training.service';
import { AiFeedbackService } from './ai-feedback.service';
import { ModelRegistryService } from './model-registry.service';
import { Decimal } from '@prisma/client/runtime/library';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ss = require('simple-statistics');

export interface DepartmentStats {
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  count: number;
}

export interface EmployeeBenchmarkResult {
  employeeId: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  salary: number;
  departmentStats: DepartmentStats;
  compensationIndex: number;
  status: 'underpaid' | 'fair' | 'overpaid';
  recommendation: string;
}

export interface DepartmentBenchmark {
  department: string;
  count: number;
  median: number;
  p25: number;
  p75: number;
  avgSalary: number;
  outlierCount: number;
}

export interface SalaryOutlier {
  employeeId: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  salary: number;
  departmentMedian: number;
  deviation: 'below' | 'above';
  deviationAmount: number;
}

export interface SalaryBucket {
  range: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface SalaryDistribution {
  buckets: SalaryBucket[];
  totalEmployees: number;
  overallMedian: number;
  overallMean: number;
}

@Injectable()
export class CompensationBenchmarkService {
  private readonly logger = new Logger(CompensationBenchmarkService.name);

  constructor(
    private prisma: PrismaService,
    private modelRegistry: ModelRegistryService,
    private trainingService: AiTrainingService,
    private feedbackService: AiFeedbackService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Benchmark a single employee's compensation against their department.
   * compensationIndex = salary / department median.
   * Status: underpaid (< 0.85), fair (0.85-1.15), overpaid (> 1.15).
   * Stores compensationIndex in EmployeeAiProfile.
   */
  async benchmarkEmployee(
    organizationId: string,
    employeeId: string,
  ): Promise<EmployeeBenchmarkResult> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        status: 'ACTIVE',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        department: true,
        jobTitle: true,
        basicSalary: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const salary = Number(employee.basicSalary);
    const departmentStats = await this.getDepartmentStats(organizationId, employee.department);

    // Calculate compensation index
    const compensationIndex = departmentStats.median > 0 ? salary / departmentStats.median : 1.0;

    // Determine status
    let status: 'underpaid' | 'fair' | 'overpaid';
    if (compensationIndex < 0.85) {
      status = 'underpaid';
    } else if (compensationIndex > 1.15) {
      status = 'overpaid';
    } else {
      status = 'fair';
    }

    // Store compensationIndex in EmployeeAiProfile
    await this.prisma.employeeAiProfile.upsert({
      where: { employeeId },
      create: {
        employeeId,
        organizationId,
        compensationIndex: new Decimal(compensationIndex),
        calculatedAt: new Date(),
      },
      update: {
        compensationIndex: new Decimal(compensationIndex),
        calculatedAt: new Date(),
      },
    });

    const recommendation = this.getRecommendation(status, compensationIndex, employee.department);

    const result: EmployeeBenchmarkResult = {
      employeeId: employee.id,
      name: employee.name,
      department: employee.department,
      jobTitle: employee.jobTitle,
      salary,
      departmentStats,
      compensationIndex,
      status,
      recommendation,
    };

    // Store prediction for feedback tracking
    try {
      await this.feedbackService.storePrediction(
        organizationId,
        'COMPENSATION_BENCHMARK',
        { employeeId },
        { compensationIndex, status, recommendation },
        compensationIndex > 0 ? Math.min(1, 1 - Math.abs(1 - compensationIndex)) : 0,
        1,
      );
    } catch (error) {
      this.logger.warn(`Failed to store benchmark prediction: ${error.message}`);
    }

    return result;
  }

  /**
   * Get benchmark statistics for each department in the organization.
   * Returns median, p25, p75, average salary, and outlier count per department.
   */
  async getDepartmentBenchmarks(organizationId: string): Promise<DepartmentBenchmark[]> {
    const employees = await this.getActiveEmployees(organizationId);

    // Group by department
    const departmentGroups = new Map<string, number[]>();
    for (const emp of employees) {
      const dept = emp.department || 'Unassigned';
      if (!departmentGroups.has(dept)) {
        departmentGroups.set(dept, []);
      }
      departmentGroups.get(dept)!.push(Number(emp.basicSalary));
    }

    const benchmarks: DepartmentBenchmark[] = [];

    for (const [department, salaries] of departmentGroups) {
      if (salaries.length === 0) continue;

      const sorted = salaries.sort((a, b) => a - b);
      const median = ss.median(sorted);
      const p25 = ss.quantile(sorted, 0.25);
      const p75 = ss.quantile(sorted, 0.75);
      const avgSalary = ss.mean(sorted);

      // Count outliers using IQR method
      const iqr = p75 - p25;
      const lowerBound = p25 - 1.5 * iqr;
      const upperBound = p75 + 1.5 * iqr;
      const outlierCount = sorted.filter((s) => s < lowerBound || s > upperBound).length;

      benchmarks.push({
        department,
        count: salaries.length,
        median,
        p25,
        p75,
        avgSalary,
        outlierCount,
      });
    }

    // Sort by employee count descending
    benchmarks.sort((a, b) => b.count - a.count);

    return benchmarks;
  }

  /**
   * Find employees with salary outside IQR * 1.5 within their department.
   * IQR = p75 - p25, lower = p25 - 1.5*IQR, upper = p75 + 1.5*IQR.
   */
  async getOutliers(organizationId: string): Promise<SalaryOutlier[]> {
    const employees = await this.getActiveEmployees(organizationId);

    // Group salaries by department
    const departmentGroups = new Map<
      string,
      Array<{
        id: string;
        name: string;
        department: string | null;
        jobTitle: string | null;
        salary: number;
      }>
    >();

    for (const emp of employees) {
      const dept = emp.department || 'Unassigned';
      if (!departmentGroups.has(dept)) {
        departmentGroups.set(dept, []);
      }
      departmentGroups.get(dept)!.push({
        id: emp.id,
        name: emp.name,
        department: emp.department,
        jobTitle: emp.jobTitle,
        salary: Number(emp.basicSalary),
      });
    }

    const outliers: SalaryOutlier[] = [];

    for (const [, deptEmployees] of departmentGroups) {
      if (deptEmployees.length < 3) continue; // Need at least 3 for meaningful IQR

      const salaries = deptEmployees.map((e) => e.salary).sort((a, b) => a - b);
      const p25 = ss.quantile(salaries, 0.25);
      const p75 = ss.quantile(salaries, 0.75);
      const iqr = p75 - p25;
      const lowerBound = p25 - 1.5 * iqr;
      const upperBound = p75 + 1.5 * iqr;
      const departmentMedian = ss.median(salaries);

      for (const emp of deptEmployees) {
        if (emp.salary < lowerBound) {
          outliers.push({
            employeeId: emp.id,
            name: emp.name,
            department: emp.department,
            jobTitle: emp.jobTitle,
            salary: emp.salary,
            departmentMedian,
            deviation: 'below',
            deviationAmount: lowerBound - emp.salary,
          });
        } else if (emp.salary > upperBound) {
          outliers.push({
            employeeId: emp.id,
            name: emp.name,
            department: emp.department,
            jobTitle: emp.jobTitle,
            salary: emp.salary,
            departmentMedian,
            deviation: 'above',
            deviationAmount: emp.salary - upperBound,
          });
        }
      }
    }

    // Sort by deviation amount descending
    outliers.sort((a, b) => b.deviationAmount - a.deviationAmount);

    return outliers;
  }

  /**
   * Get a histogram of salary ranges across the entire organization.
   * Groups into dynamic buckets (e.g., 0-2000, 2000-4000, etc.).
   */
  async getSalaryDistribution(organizationId: string): Promise<SalaryDistribution> {
    const employees = await this.getActiveEmployees(organizationId);

    if (employees.length === 0) {
      return {
        buckets: [],
        totalEmployees: 0,
        overallMedian: 0,
        overallMean: 0,
      };
    }

    const salaries = employees.map((e) => Number(e.basicSalary)).sort((a, b) => a - b);

    const overallMedian = ss.median(salaries);
    const overallMean = ss.mean(salaries);
    const minSalary = salaries[0];
    const maxSalary = salaries[salaries.length - 1];

    // Calculate dynamic bucket size based on salary range
    const range = maxSalary - minSalary;
    let bucketSize: number;
    if (range <= 5000) {
      bucketSize = 1000;
    } else if (range <= 20000) {
      bucketSize = 2000;
    } else if (range <= 50000) {
      bucketSize = 5000;
    } else {
      bucketSize = 10000;
    }

    // Create buckets
    const bucketStart = Math.floor(minSalary / bucketSize) * bucketSize;
    const bucketEnd = Math.ceil((maxSalary + 1) / bucketSize) * bucketSize;

    const buckets: SalaryBucket[] = [];
    for (let start = bucketStart; start < bucketEnd; start += bucketSize) {
      const end = start + bucketSize;
      const count = salaries.filter((s) => s >= start && s < end).length;

      buckets.push({
        range: `${this.formatCurrency(start)}-${this.formatCurrency(end)}`,
        min: start,
        max: end,
        count,
        percentage: employees.length > 0 ? (count / employees.length) * 100 : 0,
      });
    }

    return {
      buckets,
      totalEmployees: employees.length,
      overallMedian,
      overallMean,
    };
  }

  /**
   * Record user feedback on a compensation benchmark result.
   * If the user provides an adjustedRatio, it is stored as a correction
   * and may trigger model retraining when the threshold is reached.
   */
  async recordBenchmarkFeedback(
    organizationId: string,
    employeeId: string,
    wasCorrect: boolean,
    adjustedRatio?: number,
  ): Promise<void> {
    const label = wasCorrect
      ? 'correct'
      : adjustedRatio !== undefined
        ? String(adjustedRatio)
        : 'incorrect';

    await this.trainingService.addTrainingData(
      organizationId,
      'COMPENSATION_BENCHMARK',
      { employeeId },
      label,
      wasCorrect ? 'USER' : 'CORRECTION',
    );

    if (!wasCorrect) {
      const { shouldRetrain } = await this.feedbackService.checkRetrainingThreshold(
        organizationId,
        'COMPENSATION_BENCHMARK',
      );

      if (shouldRetrain) {
        this.logger.log(
          `Compensation benchmark retraining threshold reached for org ${organizationId}`,
        );
        this.eventEmitter.emit('ai.retraining.needed', {
          organizationId,
          feature: 'COMPENSATION_BENCHMARK',
        });
      }
    }
  }

  // ─── PRIVATE HELPERS ───

  /**
   * Get all active, non-deleted employees with salary info.
   */
  private async getActiveEmployees(organizationId: string) {
    return this.prisma.employee.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        department: true,
        jobTitle: true,
        basicSalary: true,
      },
    });
  }

  /**
   * Get statistical summary for a specific department.
   */
  private async getDepartmentStats(
    organizationId: string,
    department: string | null,
  ): Promise<DepartmentStats> {
    if (!department) {
      return { median: 0, p25: 0, p75: 0, min: 0, max: 0, count: 0 };
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        department,
        status: 'ACTIVE',
        isActive: true,
      },
      select: { basicSalary: true },
    });

    if (employees.length === 0) {
      return { median: 0, p25: 0, p75: 0, min: 0, max: 0, count: 0 };
    }

    const salaries = employees.map((e) => Number(e.basicSalary)).sort((a, b) => a - b);

    return {
      median: ss.median(salaries),
      p25: ss.quantile(salaries, 0.25),
      p75: ss.quantile(salaries, 0.75),
      min: ss.min(salaries),
      max: ss.max(salaries),
      count: salaries.length,
    };
  }

  /**
   * Generate a compensation recommendation based on status and index.
   */
  private getRecommendation(
    status: 'underpaid' | 'fair' | 'overpaid',
    compensationIndex: number,
    department: string | null,
  ): string {
    const deptLabel = department || 'their department';

    switch (status) {
      case 'underpaid':
        if (compensationIndex < 0.7) {
          return `Significantly below market for ${deptLabel} (${(compensationIndex * 100).toFixed(0)}% of median). Recommend immediate salary adjustment to reduce attrition risk.`;
        }
        return `Below median for ${deptLabel} (${(compensationIndex * 100).toFixed(0)}% of median). Consider a salary review at next cycle to align with market rates.`;
      case 'overpaid':
        if (compensationIndex > 1.3) {
          return `Well above median for ${deptLabel} (${(compensationIndex * 100).toFixed(0)}% of median). Evaluate if role scope, performance, or seniority justifies the premium.`;
        }
        return `Above median for ${deptLabel} (${(compensationIndex * 100).toFixed(0)}% of median). Compensation is slightly high; monitor at next review cycle.`;
      default:
        return `Compensation is aligned with ${deptLabel} median (${(compensationIndex * 100).toFixed(0)}% of median). No action required.`;
    }
  }

  /**
   * Format a number as a simple currency string for bucket labels.
   */
  private formatCurrency(value: number): string {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  }
}
