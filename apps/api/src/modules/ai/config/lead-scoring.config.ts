/**
 * Lead Scoring Configuration
 * Defines rules and weights for calculating lead scores
 */

import { LeadTier } from '@prisma/client';

export interface ScoringCondition {
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
  value: any;
  score: number;
}

export interface ScoringRule {
  field: string;
  conditions: ScoringCondition[];
  maxScore: number;
  description?: string;
}

export interface ScoringCategory {
  name: string;
  maxScore: number;
  rules: ScoringRule[];
}

export interface ScoringConfig {
  demographic: ScoringCategory;
  behavioral: ScoringCategory;
  engagement: ScoringCategory;
  decayConfig: {
    enabled: boolean;
    ratePerWeek: number; // Percentage decay per week of inactivity
    minScore: number; // Minimum score after decay
  };
}

/**
 * Default scoring configuration
 */
export const defaultScoringConfig: ScoringConfig = {
  demographic: {
    name: 'Demographic',
    maxScore: 40,
    rules: [
      {
        field: 'companySize',
        description: 'Company size score',
        maxScore: 10,
        conditions: [
          { operator: 'eq', value: 'enterprise', score: 10 },
          { operator: 'eq', value: 'mid-market', score: 7 },
          { operator: 'eq', value: 'smb', score: 4 },
          { operator: 'eq', value: 'startup', score: 2 },
        ],
      },
      {
        field: 'industry',
        description: 'Industry fit score',
        maxScore: 10,
        conditions: [
          {
            operator: 'in',
            value: ['finance', 'healthcare', 'manufacturing'],
            score: 10,
          },
          {
            operator: 'in',
            value: ['retail', 'technology', 'professional-services'],
            score: 6,
          },
          {
            operator: 'in',
            value: ['education', 'real-estate', 'construction'],
            score: 4,
          },
        ],
      },
      {
        field: 'country',
        description: 'Geographic location score',
        maxScore: 10,
        conditions: [
          { operator: 'in', value: ['SA', 'AE', 'EG'], score: 10 }, // Primary markets
          { operator: 'in', value: ['KW', 'QA', 'BH', 'OM'], score: 5 }, // Secondary markets
          { operator: 'in', value: ['JO', 'LB', 'MA', 'TN'], score: 3 }, // Tertiary markets
        ],
      },
      {
        field: 'estimatedBudget',
        description: 'Budget indication score',
        maxScore: 10,
        conditions: [
          { operator: 'gte', value: 50000, score: 10 },
          { operator: 'gte', value: 20000, score: 8 },
          { operator: 'gte', value: 10000, score: 6 },
          { operator: 'gt', value: 0, score: 4 },
        ],
      },
    ],
  },
  behavioral: {
    name: 'Behavioral',
    maxScore: 40,
    rules: [
      {
        field: 'websiteVisits30d',
        description: 'Website visits in last 30 days',
        maxScore: 10,
        conditions: [
          { operator: 'gte', value: 10, score: 10 },
          { operator: 'gte', value: 5, score: 7 },
          { operator: 'gte', value: 2, score: 4 },
          { operator: 'gt', value: 0, score: 2 },
        ],
      },
      {
        field: 'contentType',
        description: 'Content engagement type',
        maxScore: 10,
        conditions: [
          { operator: 'eq', value: 'pricing', score: 10 },
          { operator: 'eq', value: 'case-study', score: 8 },
          { operator: 'eq', value: 'whitepaper', score: 5 },
          { operator: 'eq', value: 'blog', score: 2 },
        ],
      },
      {
        field: 'demoRequested',
        description: 'Demo request score',
        maxScore: 15,
        conditions: [{ operator: 'eq', value: true, score: 15 }],
      },
      {
        field: 'trialStatus',
        description: 'Trial engagement',
        maxScore: 10,
        conditions: [
          { operator: 'eq', value: 'active', score: 10 },
          { operator: 'eq', value: 'expired', score: 3 },
        ],
      },
    ],
  },
  engagement: {
    name: 'Engagement Recency',
    maxScore: 20,
    rules: [
      {
        field: 'daysSinceLastActivity',
        description: 'Recency of engagement',
        maxScore: 20,
        conditions: [
          { operator: 'eq', value: 0, score: 20 }, // Today
          { operator: 'lt', value: 3, score: 18 }, // Last 3 days
          { operator: 'lt', value: 7, score: 15 }, // Last week
          { operator: 'lt', value: 14, score: 12 }, // Last 2 weeks
          { operator: 'lt', value: 30, score: 10 }, // Last month
          { operator: 'lt', value: 60, score: 5 }, // Last 2 months
        ],
      },
    ],
  },
  decayConfig: {
    enabled: true,
    ratePerWeek: 5, // 5% decay per week of inactivity
    minScore: 0,
  },
};

/**
 * Get tier from score
 */
export function getTierFromScore(score: number): LeadTier {
  if (score >= 80) return 'HOT';
  if (score >= 50) return 'WARM';
  if (score >= 25) return 'COOL';
  return 'COLD';
}

/**
 * Get tier color for UI
 */
export function getTierColor(tier: LeadTier): string {
  switch (tier) {
    case 'HOT':
      return '#ef4444'; // Red
    case 'WARM':
      return '#f97316'; // Orange
    case 'COOL':
      return '#3b82f6'; // Blue
    case 'COLD':
      return '#6b7280'; // Gray
    default:
      return '#6b7280';
  }
}

/**
 * Get tier label
 */
export function getTierLabel(tier: LeadTier): string {
  switch (tier) {
    case 'HOT':
      return 'Hot Lead';
    case 'WARM':
      return 'Warm Lead';
    case 'COOL':
      return 'Cool Lead';
    case 'COLD':
      return 'Cold Lead';
    default:
      return 'Unknown';
  }
}

/**
 * Calculate decay multiplier based on weeks of inactivity
 */
export function getDecayMultiplier(
  weeksInactive: number,
  config: ScoringConfig = defaultScoringConfig,
): number {
  if (!config.decayConfig.enabled || weeksInactive <= 0) {
    return 1;
  }

  const decayRate = config.decayConfig.ratePerWeek / 100;
  const multiplier = Math.pow(1 - decayRate, weeksInactive);

  // Ensure minimum score ratio
  const minMultiplier = config.decayConfig.minScore / 100;
  return Math.max(multiplier, minMultiplier);
}

/**
 * Estimate conversion probability from score
 */
export function estimateConversionProbability(score: number, tier: LeadTier): number {
  // Base probability from tier
  let baseProbability: number;
  switch (tier) {
    case 'HOT':
      baseProbability = 0.4; // 40% base for hot leads
      break;
    case 'WARM':
      baseProbability = 0.2; // 20% base for warm leads
      break;
    case 'COOL':
      baseProbability = 0.1; // 10% base for cool leads
      break;
    case 'COLD':
      baseProbability = 0.05; // 5% base for cold leads
      break;
    default:
      baseProbability = 0.05;
  }

  // Adjust based on score within tier
  const tierMin = tier === 'HOT' ? 80 : tier === 'WARM' ? 50 : tier === 'COOL' ? 25 : 0;
  const tierMax = tier === 'HOT' ? 100 : tier === 'WARM' ? 79 : tier === 'COOL' ? 49 : 24;
  const tierRange = tierMax - tierMin;
  const scoreInTier = score - tierMin;
  const tierProgress = tierRange > 0 ? scoreInTier / tierRange : 0;

  // Add bonus for being high within tier (up to 20% bonus)
  const probability = baseProbability + tierProgress * 0.2 * baseProbability;

  return Math.min(0.95, Math.max(0.01, probability)); // Cap between 1% and 95%
}

/**
 * Get recommended action based on tier and score
 */
export function getRecommendedAction(tier: LeadTier, score: number, daysInactive: number): string {
  if (tier === 'HOT') {
    if (daysInactive > 7) {
      return 'Immediate follow-up required - hot lead going cold';
    }
    return 'Schedule demo or sales call immediately';
  }

  if (tier === 'WARM') {
    if (daysInactive > 14) {
      return 'Re-engage with personalized content';
    }
    return 'Send case study or success story';
  }

  if (tier === 'COOL') {
    if (daysInactive > 30) {
      return 'Add to nurture campaign';
    }
    return 'Share educational content to build engagement';
  }

  // COLD
  if (daysInactive > 60) {
    return 'Consider archiving or minimal touch campaign';
  }
  return 'Add to automated nurture sequence';
}

/**
 * Get re-engagement suggestion for cold/inactive leads
 */
export function getReengagementSuggestion(
  daysInactive: number,
  previousEngagements: string[],
): string {
  if (daysInactive > 90) {
    return 'Send win-back campaign with special offer';
  }

  if (daysInactive > 60) {
    return 'Share new product updates or features';
  }

  if (daysInactive > 30) {
    if (previousEngagements.includes('pricing')) {
      return 'Follow up with ROI calculator or discount offer';
    }
    if (previousEngagements.includes('demo')) {
      return 'Offer personalized demo with specific use case';
    }
    return 'Send relevant industry news or insights';
  }

  return 'Continue regular nurture sequence';
}
