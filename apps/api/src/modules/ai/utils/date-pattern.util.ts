/**
 * Date Pattern Utility for Recurring Transaction Detection ("Dejavu Algorithm")
 *
 * Provides NLP-based date detection in transaction descriptions
 * and frequency pattern analysis utilities.
 */

import { RecurringFrequency } from '@prisma/client';

// Month name patterns (English + Arabic)
const MONTH_PATTERNS: Record<string, number> = {
  // English full names
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  // English abbreviations
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  // Arabic month names
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  أبريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  أغسطس: 8,
  سبتمبر: 9,
  أكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

// Quarter patterns
const QUARTER_PATTERNS: Record<string, number[]> = {
  q1: [1, 2, 3],
  q2: [4, 5, 6],
  q3: [7, 8, 9],
  q4: [10, 11, 12],
  'first quarter': [1, 2, 3],
  'second quarter': [4, 5, 6],
  'third quarter': [7, 8, 9],
  'fourth quarter': [10, 11, 12],
};

// Frequency detection patterns
export const FREQUENCY_PATTERNS = {
  DAILY: { min: 0, max: 2, days: 1, label: 'Daily' },
  WEEKLY: { min: 6, max: 8, days: 7, label: 'Weekly' },
  BIWEEKLY: { min: 13, max: 15, days: 14, label: 'Bi-Weekly' },
  MONTHLY: { min: 28, max: 31, days: 30, label: 'Monthly' },
  QUARTERLY: { min: 88, max: 92, days: 90, label: 'Quarterly' },
  YEARLY: { min: 360, max: 370, days: 365, label: 'Yearly' },
} as const;

export interface DateDetectionResult {
  hasDate: boolean;
  extractedDate: Date | null;
  pattern: string;
  confidence: number;
  dateType: 'month' | 'quarter' | 'date' | 'year' | null;
}

export interface FrequencyResult {
  frequency: RecurringFrequency | null;
  interval: number;
  stdDev: number;
  confidence: number;
  patternType: keyof typeof FREQUENCY_PATTERNS | null;
}

/**
 * Detect date patterns in transaction descriptions
 * Examples: "Rent January 2024", "Monthly fee 01/15", "Subscription Dec"
 */
export function detectDateInDescription(description: string): DateDetectionResult {
  if (!description) {
    return { hasDate: false, extractedDate: null, pattern: '', confidence: 0, dateType: null };
  }

  const normalizedDesc = description.toLowerCase().trim();
  let hasDate = false;
  let extractedDate: Date | null = null;
  let pattern = description;
  let confidence = 0;
  let dateType: DateDetectionResult['dateType'] = null;

  // Check for month names
  for (const [monthName, monthNum] of Object.entries(MONTH_PATTERNS)) {
    const regex = new RegExp(`\\b${monthName}\\b`, 'i');
    if (regex.test(normalizedDesc)) {
      hasDate = true;
      dateType = 'month';
      confidence = 0.85;

      // Try to extract year
      const yearMatch = normalizedDesc.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

      extractedDate = new Date(year, monthNum - 1, 1);

      // Replace month name with placeholder
      pattern = pattern.replace(regex, '{MONTH}');
      break;
    }
  }

  // Check for quarter patterns
  if (!hasDate) {
    for (const [quarterName, months] of Object.entries(QUARTER_PATTERNS)) {
      const regex = new RegExp(`\\b${quarterName}\\b`, 'i');
      if (regex.test(normalizedDesc)) {
        hasDate = true;
        dateType = 'quarter';
        confidence = 0.8;

        const yearMatch = normalizedDesc.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

        extractedDate = new Date(year, months[0] - 1, 1);
        pattern = pattern.replace(regex, '{QUARTER}');
        break;
      }
    }
  }

  // Check for date patterns (MM/DD, DD/MM, YYYY-MM-DD)
  if (!hasDate) {
    const datePatterns = [
      { regex: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, type: 'iso' }, // YYYY-MM-DD
      { regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/, type: 'mdy' }, // MM/DD/YYYY
      { regex: /\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/, type: 'mdy' }, // MM-DD-YYYY
      { regex: /\b(\d{1,2})\/(\d{1,2})\b/, type: 'md' }, // MM/DD
    ];

    for (const { regex, type } of datePatterns) {
      const match = normalizedDesc.match(regex);
      if (match) {
        hasDate = true;
        dateType = 'date';
        confidence = 0.9;

        try {
          if (type === 'iso') {
            extractedDate = new Date(
              parseInt(match[1]),
              parseInt(match[2]) - 1,
              parseInt(match[3]),
            );
          } else if (type === 'mdy' && match[3]) {
            let year = parseInt(match[3]);
            if (year < 100) year += 2000;
            extractedDate = new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
          } else if (type === 'md') {
            extractedDate = new Date(
              new Date().getFullYear(),
              parseInt(match[1]) - 1,
              parseInt(match[2]),
            );
          }
        } catch {
          extractedDate = null;
        }

        pattern = pattern.replace(regex, '{DATE}');
        break;
      }
    }
  }

  // Check for year only
  if (!hasDate) {
    const yearMatch = normalizedDesc.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      hasDate = true;
      dateType = 'year';
      confidence = 0.6;
      extractedDate = new Date(parseInt(yearMatch[1]), 0, 1);
      pattern = pattern.replace(new RegExp(yearMatch[0], 'g'), '{YEAR}');
    }
  }

  // Replace any remaining numbers that look like identifiers
  pattern = pattern.replace(/\b\d{3,}\b/g, '{NUM}');
  pattern = pattern.replace(/\s+/g, ' ').trim();

  return { hasDate, extractedDate, pattern, confidence, dateType };
}

/**
 * Normalize entity names for clustering
 * Handles variations like "ABC Corp", "ABC Corporation", "ABC CORP."
 */
export function normalizeEntityName(name: string): string {
  if (!name) return '';

  let normalized = name.toLowerCase().trim();

  // Remove common suffixes
  const suffixes = [
    'inc',
    'incorporated',
    'corp',
    'corporation',
    'llc',
    'ltd',
    'limited',
    'co',
    'company',
    'pvt',
    'private',
    'plc',
    'gmbh',
    'ag',
    's\\.a\\.',
    'sa',
    'srl',
  ];

  for (const suffix of suffixes) {
    const regex = new RegExp(`\\b${suffix}\\.?\\s*$`, 'i');
    normalized = normalized.replace(regex, '');
  }

  // Remove special characters but keep spaces
  normalized = normalized.replace(/[^a-z0-9\s\u0600-\u06FF]/g, '');

  // Normalize multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Calculate frequency from time deltas between occurrences
 */
export function detectFrequency(dates: Date[]): FrequencyResult {
  if (dates.length < 2) {
    return { frequency: null, interval: 0, stdDev: 0, confidence: 0, patternType: null };
  }

  // Sort dates chronologically
  const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());

  // Calculate deltas between consecutive dates
  const deltas: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const delta = Math.round(
      (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / (1000 * 60 * 60 * 24),
    );
    deltas.push(delta);
  }

  if (deltas.length === 0) {
    return { frequency: null, interval: 0, stdDev: 0, confidence: 0, patternType: null };
  }

  // Calculate mean and standard deviation
  const mean = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  const variance =
    deltas.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deltas.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (lower = more consistent pattern)
  const cv = mean > 0 ? stdDev / mean : Infinity;

  // Match to frequency patterns
  let bestMatch: keyof typeof FREQUENCY_PATTERNS | null = null;
  let bestMatchScore = 0;

  for (const [patternName, pattern] of Object.entries(FREQUENCY_PATTERNS)) {
    if (mean >= pattern.min && mean <= pattern.max) {
      // Score based on how close mean is to expected days
      const distance = Math.abs(mean - pattern.days);
      const score = 1 - distance / pattern.days;

      if (score > bestMatchScore) {
        bestMatch = patternName as keyof typeof FREQUENCY_PATTERNS;
        bestMatchScore = score;
      }
    }
  }

  // Calculate confidence based on pattern consistency
  let confidence = 0;
  if (bestMatch) {
    // Base confidence from CV
    if (cv < 0.1) {
      confidence = 0.95; // Very consistent
    } else if (cv < 0.2) {
      confidence = 0.85; // Consistent
    } else if (cv < 0.3) {
      confidence = 0.7; // Moderate
    } else if (cv < 0.5) {
      confidence = 0.5; // Low
    } else {
      confidence = 0.3; // Very inconsistent
    }

    // Boost confidence for more occurrences
    confidence = Math.min(1, confidence * (1 + deltas.length * 0.05));
  }

  // Map to Prisma RecurringFrequency
  const frequencyMap: Record<string, RecurringFrequency> = {
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    BIWEEKLY: 'WEEKLY', // Closest match
    MONTHLY: 'MONTHLY',
    QUARTERLY: 'QUARTERLY',
    YEARLY: 'YEARLY',
  };

  return {
    frequency: bestMatch ? frequencyMap[bestMatch] : null,
    interval: Math.round(mean),
    stdDev: Math.round(stdDev * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    patternType: bestMatch,
  };
}

/**
 * Check if two amounts are within variance threshold
 */
export function isAmountMatch(
  amount1: number,
  amount2: number,
  variance: number = 0.01,
): boolean {
  if (amount1 === 0 && amount2 === 0) return true;
  if (amount1 === 0 || amount2 === 0) return false;

  const diff = Math.abs(amount1 - amount2);
  const maxAmount = Math.max(Math.abs(amount1), Math.abs(amount2));
  const percentDiff = diff / maxAmount;

  return percentDiff <= variance;
}

/**
 * Group amount into cluster bucket
 * Returns the cluster center for amounts within variance
 */
export function getAmountCluster(amount: number, variance: number = 0.01): number {
  // Round to 2 decimal places first
  const rounded = Math.round(amount * 100) / 100;

  // For small amounts, use exact value
  if (Math.abs(rounded) < 10) {
    return rounded;
  }

  // Calculate cluster size based on variance
  const clusterSize = Math.abs(rounded) * variance;

  // Round to nearest cluster
  return Math.round(rounded / clusterSize) * clusterSize;
}

/**
 * Calculate days until next occurrence based on frequency
 */
export function calculateNextOccurrence(
  lastDate: Date,
  frequency: RecurringFrequency,
): Date {
  const nextDate = new Date(lastDate);

  switch (frequency) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }

  return nextDate;
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
}

/**
 * Check if a transaction might be a duplicate
 * Same entity + same amount + within window
 */
export function isPotentialDuplicate(
  transaction1: { entityName: string; amount: number; date: Date },
  transaction2: { entityName: string; amount: number; date: Date },
  windowDays: number = 3,
  amountVariance: number = 0.01,
): boolean {
  // Check entity name match
  if (normalizeEntityName(transaction1.entityName) !== normalizeEntityName(transaction2.entityName)) {
    return false;
  }

  // Check amount match
  if (!isAmountMatch(transaction1.amount, transaction2.amount, amountVariance)) {
    return false;
  }

  // Check date window
  if (daysBetween(transaction1.date, transaction2.date) > windowDays) {
    return false;
  }

  return true;
}

/**
 * Generate a description hash for pattern grouping
 */
export function generatePatternHash(pattern: string): string {
  let hash = 0;
  const str = pattern.toLowerCase().replace(/\s+/g, '');

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16).padStart(8, '0');
}
