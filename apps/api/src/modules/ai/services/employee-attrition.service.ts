import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeedbackService } from './ai-feedback.service';
import { AiTrainingService } from './ai-training.service';
import { Decimal } from '@prisma/client/runtime/library';
import { getRiskLevel } from '../utils/risk-level.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RandomForestClassifier } = require('ml-random-forest');

export interface AttritionFeatures {
  tenure: number; // months since hire date
  salaryRatio: number; // employee salary / department median salary
  absenceRate: number; // absences in last 3 months / working days
  departmentTurnover: number; // terminated employees / total in dept in last year
}

export interface AttritionFactor {
  factor: string;
  impact: number;
  description: string;
}

export interface AttritionPredictionResult {
  employeeId: string;
  employeeName: string;
  attritionRisk: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: AttritionFactor[];
  confidence: number;
  recommendation: string;
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export interface FlightRiskEmployee {
  employeeId: string;
  employeeName: string;
  department: string | null;
  jobTitle: string | null;
  attritionRisk: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: AttritionFactor[];
}

export interface AttritionBatchResult {
  processed: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

export interface AttritionTrainingResult {
  version: number;
  accuracy: number;
  sampleCount: number;
  message: string;
}

@Injectable()
export class EmployeeAttritionService {
  private readonly logger = new Logger(EmployeeAttritionService.name);
  private readonly ML_BLEND_WEIGHT = 0.4; // 40% ML, 60% rule-based
  private readonly MIN_TRAINING_SAMPLES = 30;

  constructor(
    private prisma: PrismaService,
    private modelRegistry: ModelRegistryService,
    private feedbackService: AiFeedbackService,
    private trainingService: AiTrainingService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Predict attrition risk for a single employee.
   * Blends rule-based scoring (60%) with ML prediction (40%) when a model is available.
   */
  async predictAttrition(
    organizationId: string,
    employeeId: string,
  ): Promise<AttritionPredictionResult> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const features = await this.extractAttritionFeatures(organizationId, employeeId);
    const { score: ruleScore, factors } = this.calculateRuleBasedScore(features);

    // Try ML prediction
    let mlScore: number | null = null;
    try {
      const model = await this.modelRegistry.loadActiveModel(organizationId, 'EMPLOYEE_ATTRITION');
      if (model?.modelData) {
        const classifier = RandomForestClassifier.load(model.modelData);
        const featureVector = this.featuresToVector(features);
        const prediction = classifier.predict([featureVector]);
        // RandomForest returns class (0 or 1); use predict probability-like approach
        // by averaging predictions from individual trees via toJSON
        mlScore = prediction[0] === 1 ? 0.8 : 0.2;
      }
    } catch (error) {
      this.logger.warn(
        `ML attrition prediction failed for employee ${employeeId}, falling back to rule-based: ${error.message}`,
      );
    }

    // Blend scores: 60% rule-based + 40% ML when available
    const finalScore =
      mlScore !== null
        ? ruleScore * (1 - this.ML_BLEND_WEIGHT) + mlScore * this.ML_BLEND_WEIGHT
        : ruleScore;

    const riskLevel = getRiskLevel(finalScore);
    const confidence = mlScore !== null ? 0.85 : 0.7;

    // Store result in EmployeeAiProfile
    await this.prisma.employeeAiProfile.upsert({
      where: { employeeId },
      create: {
        employeeId,
        organizationId,
        attritionRisk: new Decimal(finalScore),
        attritionFactors: factors as any,
        calculatedAt: new Date(),
      },
      update: {
        attritionRisk: new Decimal(finalScore),
        attritionFactors: factors as any,
        calculatedAt: new Date(),
      },
    });

    const result: AttritionPredictionResult = {
      employeeId,
      employeeName: employee.name,
      attritionRisk: finalScore,
      riskLevel,
      factors,
      confidence,
      recommendation: this.getRecommendation(riskLevel, factors),
      predictionMethod: mlScore !== null ? 'HYBRID' : 'RULE_BASED',
    };

    // Store prediction for feedback tracking
    await this.feedbackService.storePrediction(
      organizationId,
      'EMPLOYEE_ATTRITION',
      { employeeId },
      { attritionRisk: finalScore, riskLevel },
      confidence,
      0,
    );

    return result;
  }

  /**
   * Get top flight-risk employees (attritionRisk >= 0.5), sorted by risk descending.
   */
  async getFlightRisk(organizationId: string, limit: number = 20): Promise<FlightRiskEmployee[]> {
    const profiles = await this.prisma.employeeAiProfile.findMany({
      where: {
        organizationId,
        attritionRisk: { gte: 0.5 },
      },
      orderBy: { attritionRisk: 'desc' },
      take: limit,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            department: true,
            jobTitle: true,
          },
        },
      },
    });

    return profiles.map((profile) => {
      const risk = Number(profile.attritionRisk);
      return {
        employeeId: profile.employeeId,
        employeeName: profile.employee.name,
        department: profile.employee.department,
        jobTitle: profile.employee.jobTitle,
        attritionRisk: risk,
        riskLevel: getRiskLevel(risk),
        factors: (profile.attritionFactors as unknown as AttritionFactor[]) || [],
      };
    });
  }

  /**
   * Batch predict attrition for all active employees in the organization.
   */
  async predictAll(organizationId: string): Promise<AttritionBatchResult> {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, status: 'ACTIVE', isActive: true },
      select: { id: true },
    });

    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;

    for (const employee of employees) {
      try {
        const result = await this.predictAttrition(organizationId, employee.id);
        if (result.riskLevel === 'CRITICAL' || result.riskLevel === 'HIGH') {
          highRisk++;
        } else if (result.riskLevel === 'MEDIUM') {
          mediumRisk++;
        } else {
          lowRisk++;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to predict attrition for employee ${employee.id}: ${error.message}`,
        );
      }
    }

    return {
      processed: employees.length,
      highRisk,
      mediumRisk,
      lowRisk,
    };
  }

  /**
   * Train a RandomForest model from employees with known outcomes.
   * TERMINATED status = 1 (left), ACTIVE with 1+ year tenure = 0 (stayed).
   * Requires minimum 30 samples. Uses 80/20 train/test split.
   */
  async trainModel(organizationId: string): Promise<AttritionTrainingResult> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Positive samples: terminated employees
    const terminatedEmployees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        status: 'TERMINATED',
      },
      select: { id: true },
    });

    // Negative samples: active employees with 1+ year tenure
    const activeEmployees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        isActive: true,
        hireDate: { lte: oneYearAgo },
      },
      select: { id: true },
    });

    const allSamples = [
      ...terminatedEmployees.map((e) => ({ id: e.id, label: 1 })),
      ...activeEmployees.map((e) => ({ id: e.id, label: 0 })),
    ];

    if (allSamples.length < this.MIN_TRAINING_SAMPLES) {
      return {
        version: 0,
        accuracy: 0,
        sampleCount: allSamples.length,
        message: `Insufficient data: ${allSamples.length} samples, need ${this.MIN_TRAINING_SAMPLES}`,
      };
    }

    this.logger.log(
      `Training attrition model for org ${organizationId} with ${allSamples.length} samples ` +
        `(${terminatedEmployees.length} terminated, ${activeEmployees.length} active)`,
    );

    // Extract features for all samples
    const features: number[][] = [];
    const labels: number[] = [];

    for (const sample of allSamples) {
      try {
        const featureSet = await this.extractAttritionFeatures(organizationId, sample.id);
        features.push(this.featuresToVector(featureSet));
        labels.push(sample.label);
      } catch (error) {
        this.logger.debug(`Skipping employee ${sample.id} for training: ${error.message}`);
        continue;
      }
    }

    if (features.length < this.MIN_TRAINING_SAMPLES) {
      return {
        version: 0,
        accuracy: 0,
        sampleCount: features.length,
        message: `Insufficient valid features: ${features.length} samples after extraction, need ${this.MIN_TRAINING_SAMPLES}`,
      };
    }

    // 80/20 train/test split
    const splitIdx = Math.floor(features.length * 0.8);
    const trainFeatures = features.slice(0, splitIdx);
    const trainLabels = labels.slice(0, splitIdx);
    const testFeatures = features.slice(splitIdx);
    const testLabels = labels.slice(splitIdx);

    // Train RandomForest
    const classifier = new RandomForestClassifier({ nEstimators: 50 });
    classifier.train(trainFeatures, trainLabels);

    // Evaluate on test set
    const predictions = classifier.predict(testFeatures);
    let correct = 0;
    for (let i = 0; i < testLabels.length; i++) {
      if (predictions[i] === testLabels[i]) correct++;
    }
    const accuracy = testLabels.length > 0 ? correct / testLabels.length : 0;

    // Save model via registry
    const saved = await this.modelRegistry.saveModel(
      organizationId,
      'EMPLOYEE_ATTRITION',
      classifier.toJSON(),
      accuracy,
      features.length,
    );

    this.logger.log(
      `Attrition model trained: v${saved.version}, accuracy=${(accuracy * 100).toFixed(1)}%, ` +
        `samples=${features.length}`,
    );

    return {
      version: saved.version,
      accuracy,
      sampleCount: features.length,
      message: `Model trained with ${features.length} samples (accuracy: ${(accuracy * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Record user feedback on an attrition prediction.
   */
  async recordAttritionFeedback(
    organizationId: string,
    employeeId: string,
    wasCorrect: boolean,
    actualLeft?: boolean,
  ): Promise<void> {
    const label =
      actualLeft !== undefined
        ? actualLeft
          ? 'LEFT'
          : 'STAYED'
        : wasCorrect
          ? 'CORRECT'
          : 'INCORRECT';

    await this.trainingService.addTrainingData(
      organizationId,
      'EMPLOYEE_ATTRITION',
      { employeeId },
      label,
      wasCorrect ? 'USER' : 'CORRECTION',
    );

    if (!wasCorrect) {
      const { shouldRetrain } = await this.feedbackService.checkRetrainingThreshold(
        organizationId,
        'EMPLOYEE_ATTRITION',
      );

      if (shouldRetrain) {
        this.logger.log(
          `Attrition prediction retraining threshold reached for org ${organizationId}`,
        );
        this.eventEmitter.emit('ai.retraining.needed', {
          organizationId,
          feature: 'EMPLOYEE_ATTRITION',
        });
      }
    }
  }

  // ─── PRIVATE HELPERS ───

  /**
   * Extract attrition feature vector for a given employee.
   */
  private async extractAttritionFeatures(
    organizationId: string,
    employeeId: string,
  ): Promise<AttritionFeatures> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: {
        hireDate: true,
        dateOfJoining: true,
        basicSalary: true,
        department: true,
        status: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    // 1. Tenure in months since hire date
    const now = new Date();
    const hireDate = employee.hireDate || employee.dateOfJoining;
    const tenureMs = now.getTime() - hireDate.getTime();
    const tenure = Math.max(0, tenureMs / (1000 * 60 * 60 * 24 * 30.44));

    // 2. Salary ratio: employee salary / department median salary
    const salaryRatio = await this.calculateSalaryRatio(
      organizationId,
      employee.department,
      Number(employee.basicSalary),
    );

    // 3. Absence rate: absences in last 3 months / total working days
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const attendanceRecords = await this.prisma.attendance.findMany({
      where: {
        organizationId,
        employeeId,
        date: { gte: threeMonthsAgo },
      },
      select: { status: true },
    });

    const totalDays = attendanceRecords.length || 1; // avoid division by zero
    const absences = attendanceRecords.filter(
      (a) => a.status === 'ABSENT' || a.status === 'LEAVE',
    ).length;
    const absenceRate = absences / totalDays;

    // 4. Department turnover: terminated / total in department in last year
    const departmentTurnover = await this.calculateDepartmentTurnover(
      organizationId,
      employee.department,
    );

    return {
      tenure,
      salaryRatio,
      absenceRate,
      departmentTurnover,
    };
  }

  /**
   * Calculate salary ratio: employee salary / department median salary.
   */
  private async calculateSalaryRatio(
    organizationId: string,
    department: string | null,
    employeeSalary: number,
  ): Promise<number> {
    if (!department || employeeSalary === 0) return 1.0;

    const departmentEmployees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        department,
        status: 'ACTIVE',
        isActive: true,
      },
      select: { basicSalary: true },
    });

    if (departmentEmployees.length === 0) return 1.0;

    const salaries = departmentEmployees.map((e) => Number(e.basicSalary)).sort((a, b) => a - b);

    const midIndex = Math.floor(salaries.length / 2);
    const median =
      salaries.length % 2 === 0
        ? (salaries[midIndex - 1] + salaries[midIndex]) / 2
        : salaries[midIndex];

    return median > 0 ? employeeSalary / median : 1.0;
  }

  /**
   * Calculate department turnover rate over the last year.
   */
  private async calculateDepartmentTurnover(
    organizationId: string,
    department: string | null,
  ): Promise<number> {
    if (!department) return 0;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const [totalInDept, terminatedInDept] = await Promise.all([
      this.prisma.employee.count({
        where: {
          organizationId,
          department,
        },
      }),
      this.prisma.employee.count({
        where: {
          organizationId,
          department,
          status: 'TERMINATED',
          updatedAt: { gte: oneYearAgo },
        },
      }),
    ]);

    return totalInDept > 0 ? terminatedInDept / totalInDept : 0;
  }

  /**
   * Calculate rule-based attrition score from features.
   */
  private calculateRuleBasedScore(features: AttritionFeatures): {
    score: number;
    factors: AttritionFactor[];
  } {
    const factors: AttritionFactor[] = [];
    let score = 0;

    // Tenure factor (0-0.25): shorter tenure = higher risk
    if (features.tenure < 6) {
      score += 0.25;
      factors.push({
        factor: 'short_tenure',
        impact: 0.25,
        description: 'Less than 6 months tenure - high early attrition risk',
      });
    } else if (features.tenure < 12) {
      score += 0.15;
      factors.push({
        factor: 'short_tenure',
        impact: 0.15,
        description: 'Less than 1 year tenure - moderate early attrition risk',
      });
    } else if (features.tenure < 24) {
      score += 0.05;
      factors.push({
        factor: 'moderate_tenure',
        impact: 0.05,
        description: '1-2 years tenure - slight attrition risk',
      });
    }

    // Salary ratio factor (0-0.3): underpaid employees leave more
    if (features.salaryRatio < 0.7) {
      score += 0.3;
      factors.push({
        factor: 'significantly_underpaid',
        impact: 0.3,
        description: 'Salary is significantly below department median (< 70%)',
      });
    } else if (features.salaryRatio < 0.85) {
      score += 0.2;
      factors.push({
        factor: 'underpaid',
        impact: 0.2,
        description: 'Salary is below department median (70-85%)',
      });
    } else if (features.salaryRatio < 0.95) {
      score += 0.05;
      factors.push({
        factor: 'slightly_underpaid',
        impact: 0.05,
        description: 'Salary is slightly below department median (85-95%)',
      });
    }

    // Absence rate factor (0-0.25): high absences correlate with disengagement
    if (features.absenceRate > 0.2) {
      score += 0.25;
      factors.push({
        factor: 'high_absence',
        impact: 0.25,
        description: 'High absence rate (> 20%) in last 3 months - possible disengagement',
      });
    } else if (features.absenceRate > 0.1) {
      score += 0.15;
      factors.push({
        factor: 'moderate_absence',
        impact: 0.15,
        description: 'Moderate absence rate (10-20%) in last 3 months',
      });
    } else if (features.absenceRate > 0.05) {
      score += 0.05;
      factors.push({
        factor: 'slight_absence',
        impact: 0.05,
        description: 'Slightly elevated absence rate (5-10%) in last 3 months',
      });
    }

    // Department turnover factor (0-0.2): high turnover departments have contagion effect
    if (features.departmentTurnover > 0.3) {
      score += 0.2;
      factors.push({
        factor: 'high_dept_turnover',
        impact: 0.2,
        description: 'Department has high turnover (> 30%) - contagion effect likely',
      });
    } else if (features.departmentTurnover > 0.15) {
      score += 0.1;
      factors.push({
        factor: 'moderate_dept_turnover',
        impact: 0.1,
        description: 'Department has moderate turnover (15-30%)',
      });
    }

    return { score: Math.min(1, score), factors };
  }

  /**
   * Convert AttritionFeatures to a numeric vector for ML model.
   */
  private featuresToVector(features: AttritionFeatures): number[] {
    return [
      Math.log1p(features.tenure),
      features.salaryRatio,
      features.absenceRate,
      features.departmentTurnover,
    ];
  }

  /**
   * Generate a recommendation based on risk level and contributing factors.
   */
  private getRecommendation(riskLevel: string, factors: AttritionFactor[]): string {
    const topFactor = factors.length > 0 ? factors[0].factor : '';

    switch (riskLevel) {
      case 'CRITICAL':
        if (topFactor.includes('underpaid')) {
          return 'Urgent: Schedule a compensation review immediately. This employee is at very high risk of leaving due to below-market pay.';
        }
        return 'Urgent: Schedule a 1-on-1 retention conversation this week. Consider immediate retention incentives.';
      case 'HIGH':
        if (topFactor.includes('underpaid')) {
          return 'Schedule a compensation review within 2 weeks. Consider a market adjustment or promotion pathway.';
        }
        if (topFactor.includes('absence')) {
          return 'Investigate absence patterns. Schedule a well-being check-in and discuss workload or engagement concerns.';
        }
        return 'Schedule a career development discussion within 2 weeks. Review engagement and growth opportunities.';
      case 'MEDIUM':
        return 'Monitor engagement levels. Include in next round of stay interviews and ensure development plan is current.';
      default:
        return 'Continue regular engagement. Employee appears stable. Maintain current development plan.';
    }
  }
}
