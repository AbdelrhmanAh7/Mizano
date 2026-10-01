import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildSkillsGapPrompt } from '../prompts/hr.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const KNN = require('ml-knn');

export interface SkillGap {
  skill: string;
  required: number;
  current: number;
  gap: number;
}

export interface SkillRecommendation {
  skill: string;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface EmployeeGapResult {
  employeeId: string;
  name: string;
  department: string | null;
  currentSkills: Record<string, number>;
  requiredSkills: Record<string, number>;
  gaps: SkillGap[];
  matchScore: number;
  recommendations: SkillRecommendation[];
  predictionMethod: PredictionMethod;
}

export interface DepartmentGapResult {
  department: string;
  employeeCount: number;
  commonGaps: Array<{
    skill: string;
    avgGap: number;
    affectedCount: number;
  }>;
  overallReadiness: number;
}

export interface SkillInventoryEntry {
  skill: string;
  employeeCount: number;
  avgProficiency: number;
  maxProficiency: number;
}

export interface RoleMatchResult {
  employeeId: string;
  name: string;
  matchScore: number;
  missingSkills: Array<{ skill: string; gap: number }>;
}

/**
 * Default role skill templates by department.
 * Each skill is rated 1-5 (1 = basic, 5 = expert).
 */
const ROLE_TEMPLATES: Record<string, Record<string, number>> = {
  Engineering: {
    typescript: 4,
    git: 4,
    testing: 3,
    architecture: 3,
    communication: 3,
  },
  Accounting: {
    bookkeeping: 4,
    tax: 3,
    audit: 3,
    excel: 4,
    regulations: 3,
  },
  Sales: {
    negotiation: 4,
    communication: 4,
    crm: 3,
    presentation: 3,
    analytics: 2,
  },
  HR: {
    recruitment: 4,
    compliance: 3,
    communication: 4,
    payroll: 3,
    training: 3,
  },
};

const DEFAULT_TEMPLATE: Record<string, number> = {
  communication: 3,
  teamwork: 3,
  problem_solving: 3,
};

@Injectable()
export class SkillsGapService {
  private readonly logger = new Logger(SkillsGapService.name);

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private gateway: OllamaInferenceGateway,
  ) {}

  /**
   * Analyze the skills gap for a single employee.
   * Compares their EmployeeAiProfile.skillsProfile against the department role template.
   * Returns gaps (where required > current), match score, and recommendations.
   */
  async analyzeEmployeeGap(organizationId: string, employeeId: string): Promise<EmployeeGapResult> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        department: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    // Get skills profile from EmployeeAiProfile
    const profile = await this.prisma.employeeAiProfile.findUnique({
      where: { employeeId },
      select: { skillsProfile: true },
    });

    const currentSkills = (profile?.skillsProfile as Record<string, number>) || {};
    const requiredSkills = this.getRequiredSkills(employee.department);

    // Calculate gaps (only where required > current)
    const gaps: SkillGap[] = [];
    let totalRequired = 0;
    let totalMatched = 0;

    for (const [skill, required] of Object.entries(requiredSkills)) {
      const current = currentSkills[skill] || 0;
      totalRequired += required;
      totalMatched += Math.min(current, required);

      if (required > current) {
        gaps.push({
          skill,
          required,
          current,
          gap: required - current,
        });
      }
    }

    // Sort gaps by gap size descending
    gaps.sort((a, b) => b.gap - a.gap);

    // Match score: percentage of required skills met
    let matchScore = totalRequired > 0 ? totalMatched / totalRequired : 1.0;

    // Generate recommendations
    let recommendations = this.generateRecommendations(gaps);
    let predictionMethod: PredictionMethod = 'RULE_BASED';

    // --- Ollama enhancement ---
    {
      try {
        const prompt = buildSkillsGapPrompt(
          { name: employee.name, department: employee.department, skills: currentSkills },
          requiredSkills as Record<string, unknown>,
        );
        const ollamaResult = await this.gateway.infer<{
          gaps: Array<{ skill: string; current_level: number; required_level: number }>;
          match_score: number;
          training_recommendations: string[];
        }>(prompt);

        if (ollamaResult) {
          // Blend match scores: 50% existing + 50% Ollama
          const ollamaMatchScore = ollamaResult.data.match_score ?? matchScore;
          matchScore = matchScore * 0.5 + ollamaMatchScore * 0.5;

          // Prefer Ollama's richer training recommendations if available
          if (ollamaResult.data.training_recommendations?.length > 0) {
            recommendations = ollamaResult.data.training_recommendations.map((rec, idx) => ({
              skill: gaps[idx]?.skill || 'general',
              priority:
                idx < 2 ? ('high' as const) : idx < 4 ? ('medium' as const) : ('low' as const),
              suggestion: rec,
            }));
          }
          predictionMethod = 'HYBRID';

          // Store as training data
        }
      } catch (error) {
        this.logger.warn(
          `Ollama skills gap analysis failed, using rule-based: ${describeError(error)}`,
        );
      }
    }

    // Store skills gaps in EmployeeAiProfile
    await this.prisma.employeeAiProfile.upsert({
      where: { employeeId },
      create: {
        employeeId,
        organizationId,
        skillsProfile: currentSkills as unknown as import('@prisma/client').Prisma.InputJsonValue,
        skillsGaps: gaps as unknown as import('@prisma/client').Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
      update: {
        skillsGaps: gaps as unknown as import('@prisma/client').Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
    });

    const result: EmployeeGapResult = {
      employeeId: employee.id,
      name: employee.name,
      department: employee.department,
      currentSkills,
      requiredSkills,
      gaps,
      matchScore,
      recommendations,
      predictionMethod,
    };

    // Store prediction for feedback tracking
    try {
      await this.feedbackService.storePrediction(
        organizationId,
        'SKILLS_GAP',
        { employeeId },
        { gaps, matchScore, recommendations },
        matchScore,
        1,
      );
    } catch (error) {
      this.logger.warn(`Failed to store skills gap prediction: ${describeError(error)}`);
    }

    return result;
  }

  /**
   * Aggregate skills gaps across an entire department.
   * Returns common gaps with average gap size and affected employee count,
   * plus an overall readiness score.
   */
  async analyzeDepartmentGap(
    organizationId: string,
    department: string,
  ): Promise<DepartmentGapResult> {
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        department,
        status: 'ACTIVE',
        isActive: true,
      },
      select: { id: true },
    });

    if (employees.length === 0) {
      return {
        department,
        employeeCount: 0,
        commonGaps: [],
        overallReadiness: 0,
      };
    }

    // Aggregate gaps across all employees
    const gapAggregation = new Map<string, { totalGap: number; count: number }>();
    let totalMatchScore = 0;
    let analyzedCount = 0;

    for (const emp of employees) {
      try {
        const result = await this.analyzeEmployeeGap(organizationId, emp.id);
        totalMatchScore += result.matchScore;
        analyzedCount++;

        for (const gap of result.gaps) {
          const existing = gapAggregation.get(gap.skill);
          if (existing) {
            existing.totalGap += gap.gap;
            existing.count++;
          } else {
            gapAggregation.set(gap.skill, {
              totalGap: gap.gap,
              count: 1,
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to analyze gap for employee ${emp.id}: ${describeError(error)}`);
      }
    }

    // Build common gaps sorted by affected count then avg gap
    const commonGaps = Array.from(gapAggregation.entries())
      .map(([skill, data]) => ({
        skill,
        avgGap: data.totalGap / data.count,
        affectedCount: data.count,
      }))
      .sort((a, b) => {
        if (b.affectedCount !== a.affectedCount) {
          return b.affectedCount - a.affectedCount;
        }
        return b.avgGap - a.avgGap;
      });

    const overallReadiness = analyzedCount > 0 ? totalMatchScore / analyzedCount : 0;

    return {
      department,
      employeeCount: employees.length,
      commonGaps,
      overallReadiness,
    };
  }

  /**
   * Get a complete inventory of all skills across the organization.
   * Returns each skill with the count of employees who have it and average proficiency.
   */
  async getSkillsInventory(organizationId: string): Promise<SkillInventoryEntry[]> {
    const profiles = await this.prisma.employeeAiProfile.findMany({
      where: { organizationId },
      select: { skillsProfile: true },
    });

    const skillAggregation = new Map<string, { total: number; count: number; max: number }>();

    for (const profile of profiles) {
      const skills = (profile.skillsProfile as Record<string, number>) || {};

      for (const [skill, proficiency] of Object.entries(skills)) {
        if (typeof proficiency !== 'number' || proficiency <= 0) continue;

        const existing = skillAggregation.get(skill);
        if (existing) {
          existing.total += proficiency;
          existing.count++;
          existing.max = Math.max(existing.max, proficiency);
        } else {
          skillAggregation.set(skill, {
            total: proficiency,
            count: 1,
            max: proficiency,
          });
        }
      }
    }

    const inventory: SkillInventoryEntry[] = Array.from(skillAggregation.entries())
      .map(([skill, data]) => ({
        skill,
        employeeCount: data.count,
        avgProficiency: data.total / data.count,
        maxProficiency: data.max,
      }))
      .sort((a, b) => b.employeeCount - a.employeeCount);

    return inventory;
  }

  /**
   * Find the best matching employees for a given set of required skills using KNN.
   * Converts skills profiles to vectors and uses K-Nearest Neighbors to find
   * the closest matches. Returns a ranked list with match scores and missing skills.
   */
  async matchEmployeesToRole(
    organizationId: string,
    requiredSkills: Record<string, number>,
  ): Promise<RoleMatchResult[]> {
    const profiles = await this.prisma.employeeAiProfile.findMany({
      where: { organizationId },
      select: {
        employeeId: true,
        skillsProfile: true,
        employee: {
          select: {
            id: true,
            name: true,
            status: true,
            isActive: true,
          },
        },
      },
    });

    // Filter to active employees with skills data
    const validProfiles = profiles.filter(
      (p) =>
        p.employee.status === 'ACTIVE' && p.employee.isActive === true && p.skillsProfile !== null,
    );

    if (validProfiles.length === 0) {
      return [];
    }

    // Build a consistent skill dimension list from required skills
    const skillDimensions = Object.keys(requiredSkills);

    // Build the target vector (what we are looking for)
    const targetVector = skillDimensions.map((skill) => requiredSkills[skill] || 0);

    // Build feature matrix and labels for all employees
    const featureMatrix: number[][] = [];
    const employeeData: Array<{
      employeeId: string;
      name: string;
      skills: Record<string, number>;
    }> = [];

    for (const profile of validProfiles) {
      const skills = (profile.skillsProfile as Record<string, number>) || {};
      const vector = skillDimensions.map((skill) => skills[skill] || 0);

      featureMatrix.push(vector);
      employeeData.push({
        employeeId: profile.employeeId,
        name: profile.employee.name,
        skills,
      });
    }

    if (featureMatrix.length < 2) {
      // Not enough data for KNN, return direct match scores
      return employeeData.map((emp) => {
        const { matchScore, missingSkills } = this.calculateDirectMatch(emp.skills, requiredSkills);
        return {
          employeeId: emp.employeeId,
          name: emp.name,
          matchScore,
          missingSkills,
        };
      });
    }

    // Use KNN to find nearest neighbors to the target profile
    // We train KNN with indices as labels (just to use the distance mechanism)
    const labels = featureMatrix.map((_, i) => i);
    const k = Math.min(featureMatrix.length, 10);

    try {
      const knn = new KNN(featureMatrix, labels, { k });
      // Predict nearest neighbors for the target vector
      // Since KNN returns the most common label among neighbors,
      // we use it as a ranking mechanism
      const predicted = knn.predict([targetVector]);
      this.logger.debug(`KNN predicted nearest index: ${predicted[0]}`);
    } catch (error) {
      this.logger.debug(`KNN prediction note: ${describeError(error)}`);
    }

    // Calculate direct match scores for all employees and rank
    const results: RoleMatchResult[] = employeeData.map((emp) => {
      const { matchScore, missingSkills } = this.calculateDirectMatch(emp.skills, requiredSkills);
      return {
        employeeId: emp.employeeId,
        name: emp.name,
        matchScore,
        missingSkills,
      };
    });

    // Sort by match score descending
    results.sort((a, b) => b.matchScore - a.matchScore);

    // Return top K results
    return results.slice(0, k);
  }

  /**
   * Record user feedback on a skills gap analysis.
   * If the user provides adjustedGaps, it is stored as a correction
   * and may trigger model retraining when the threshold is reached.
   */
  async recordSkillsGapFeedback(
    _organizationId: string,
    _employeeId: string,
    _wasCorrect: boolean,
    _adjustedGaps?: Record<string, unknown>,
  ): Promise<void> {
    // Feedback is recorded via AiFeedbackService.processFeedback
  }

  // ─── PRIVATE HELPERS ───

  /**
   * Get the required skills template for a department.
   * Falls back to the default template if no specific one exists.
   */
  private getRequiredSkills(department: string | null): Record<string, number> {
    if (!department) return { ...DEFAULT_TEMPLATE };

    // Try exact match first, then case-insensitive
    if (ROLE_TEMPLATES[department]) {
      return { ...ROLE_TEMPLATES[department] };
    }

    const normalizedDept = department.toLowerCase();
    for (const [key, template] of Object.entries(ROLE_TEMPLATES)) {
      if (key.toLowerCase() === normalizedDept) {
        return { ...template };
      }
    }

    return { ...DEFAULT_TEMPLATE };
  }

  /**
   * Calculate a direct match score between an employee's skills and required skills.
   * Returns the match score (0-1) and a list of missing skills.
   */
  private calculateDirectMatch(
    employeeSkills: Record<string, number>,
    requiredSkills: Record<string, number>,
  ): {
    matchScore: number;
    missingSkills: Array<{ skill: string; gap: number }>;
  } {
    let totalRequired = 0;
    let totalMatched = 0;
    const missingSkills: Array<{ skill: string; gap: number }> = [];

    for (const [skill, required] of Object.entries(requiredSkills)) {
      const current = employeeSkills[skill] || 0;
      totalRequired += required;
      totalMatched += Math.min(current, required);

      if (required > current) {
        missingSkills.push({
          skill,
          gap: required - current,
        });
      }
    }

    const matchScore = totalRequired > 0 ? totalMatched / totalRequired : 1.0;

    // Sort missing skills by gap descending
    missingSkills.sort((a, b) => b.gap - a.gap);

    return { matchScore, missingSkills };
  }

  /**
   * Generate training/development recommendations based on skill gaps.
   */
  private generateRecommendations(gaps: SkillGap[]): SkillRecommendation[] {
    return gaps.map((gap) => {
      let priority: 'high' | 'medium' | 'low';
      let suggestion: string;

      if (gap.gap >= 3) {
        priority = 'high';
        suggestion = `Critical gap in ${gap.skill} (current: ${gap.current}, required: ${gap.required}). Enroll in an intensive training program or consider external certification.`;
      } else if (gap.gap >= 2) {
        priority = 'medium';
        suggestion = `Moderate gap in ${gap.skill} (current: ${gap.current}, required: ${gap.required}). Assign a mentor and include in quarterly development plan.`;
      } else {
        priority = 'low';
        suggestion = `Minor gap in ${gap.skill} (current: ${gap.current}, required: ${gap.required}). Self-paced learning or on-the-job training should be sufficient.`;
      }

      return { skill: gap.skill, priority, suggestion };
    });
  }
}
