import {
  detectDateInDescription,
  normalizeEntityName,
  detectFrequency,
  isAmountMatch,
  getAmountCluster,
  calculateNextOccurrence,
  daysBetween,
  isPotentialDuplicate,
  generatePatternHash,
} from './date-pattern.util';

describe('date-pattern.util', () => {
  describe('detectDateInDescription', () => {
    it('should return no date for empty string', () => {
      const result = detectDateInDescription('');
      expect(result.hasDate).toBe(false);
      expect(result.extractedDate).toBeNull();
    });

    it('should detect English month names', () => {
      const result = detectDateInDescription('Rent for January 2024');
      expect(result.hasDate).toBe(true);
      expect(result.dateType).toBe('month');
      expect(result.extractedDate?.getMonth()).toBe(0); // January
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect abbreviated month names', () => {
      const result = detectDateInDescription('Invoice Dec 2024');
      expect(result.hasDate).toBe(true);
      expect(result.dateType).toBe('month');
    });

    it('should detect Arabic month names', () => {
      const result = detectDateInDescription('إيجار يناير 2024');
      expect(result.hasDate).toBe(true);
    });

    it('should detect quarter patterns', () => {
      const result = detectDateInDescription('Q1 2024 revenue');
      expect(result.hasDate).toBe(true);
      expect(result.dateType).toBe('quarter');
    });

    it('should detect ISO date format (YYYY-MM-DD)', () => {
      const result = detectDateInDescription('Payment on 2024-01-15');
      expect(result.hasDate).toBe(true);
      expect(result.dateType).toBe('date');
      expect(result.confidence).toBe(0.9);
    });

    it('should detect MM/DD/YYYY format', () => {
      const result = detectDateInDescription('Due 01/15/2024');
      expect(result.hasDate).toBe(true);
      expect(result.dateType).toBe('date');
    });

    it('should detect MM/DD format', () => {
      const result = detectDateInDescription('Subscription 03/15');
      expect(result.hasDate).toBe(true);
    });

    it('should detect year-only', () => {
      const result = detectDateInDescription('Annual fee 2024');
      expect(result.hasDate).toBe(true);
      expect(result.dateType).toBe('year');
      expect(result.confidence).toBe(0.6);
    });

    it('should replace detected dates with placeholders in pattern', () => {
      const result = detectDateInDescription('Rent January 2024');
      expect(result.pattern).toContain('{MONTH}');
    });
  });

  describe('normalizeEntityName', () => {
    it('should return empty for empty input', () => {
      expect(normalizeEntityName('')).toBe('');
    });

    it('should lowercase and trim', () => {
      expect(normalizeEntityName('  ABC Corp  ')).toBe('abc');
    });

    it('should remove common suffixes', () => {
      expect(normalizeEntityName('Acme Inc')).toBe('acme');
      expect(normalizeEntityName('Acme Corporation')).toBe('acme');
      expect(normalizeEntityName('Acme LLC')).toBe('acme');
      expect(normalizeEntityName('Acme Ltd.')).toBe('acme');
    });

    it('should remove special characters', () => {
      expect(normalizeEntityName('ABC & Co.')).toBe('abc');
    });

    it('should preserve Arabic characters', () => {
      const result = normalizeEntityName('شركة الأمل');
      expect(result).toContain('شركة');
    });
  });

  describe('detectFrequency', () => {
    it('should return null for less than 2 dates', () => {
      const result = detectFrequency([new Date()]);
      expect(result.frequency).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should detect monthly frequency', () => {
      const dates = [
        new Date(2024, 0, 1),
        new Date(2024, 1, 1),
        new Date(2024, 2, 1),
        new Date(2024, 3, 1),
        new Date(2024, 4, 1),
      ];
      const result = detectFrequency(dates);
      expect(result.frequency).toBe('MONTHLY');
      expect(result.patternType).toBe('MONTHLY');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect weekly frequency', () => {
      const base = new Date(2024, 0, 1);
      const dates = Array.from({ length: 8 }, (_, i) => {
        const d = new Date(base);
        d.setDate(d.getDate() + i * 7);
        return d;
      });
      const result = detectFrequency(dates);
      expect(result.frequency).toBe('WEEKLY');
    });

    it('should detect quarterly frequency', () => {
      const dates = [
        new Date(2024, 0, 1),
        new Date(2024, 3, 1),
        new Date(2024, 6, 1),
        new Date(2024, 9, 1),
      ];
      const result = detectFrequency(dates);
      expect(result.frequency).toBe('QUARTERLY');
    });

    it('should detect yearly frequency', () => {
      const dates = [
        new Date(2021, 0, 1),
        new Date(2022, 0, 1),
        new Date(2023, 0, 1),
        new Date(2024, 0, 1),
      ];
      const result = detectFrequency(dates);
      expect(result.frequency).toBe('YEARLY');
    });

    it('should have higher confidence for more occurrences', () => {
      const base = new Date(2024, 0, 1);
      const shortDates = [base, new Date(2024, 1, 1), new Date(2024, 2, 1)];
      const longDates = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i);
        return d;
      });

      const shortResult = detectFrequency(shortDates);
      const longResult = detectFrequency(longDates);
      expect(longResult.confidence).toBeGreaterThanOrEqual(shortResult.confidence);
    });
  });

  describe('isAmountMatch', () => {
    it('should match identical amounts', () => {
      expect(isAmountMatch(100, 100)).toBe(true);
    });

    it('should match within 1% variance', () => {
      expect(isAmountMatch(100, 100.5, 0.01)).toBe(true);
      expect(isAmountMatch(100, 101, 0.01)).toBe(true);
    });

    it('should reject amounts outside variance', () => {
      expect(isAmountMatch(100, 110, 0.01)).toBe(false);
    });

    it('should handle zero amounts', () => {
      expect(isAmountMatch(0, 0)).toBe(true);
      expect(isAmountMatch(0, 100)).toBe(false);
      expect(isAmountMatch(100, 0)).toBe(false);
    });
  });

  describe('getAmountCluster', () => {
    it('should return exact value for small amounts', () => {
      expect(getAmountCluster(5.5)).toBe(5.5);
    });

    it('should cluster larger amounts to round values', () => {
      // clusterSize = amount * variance (default 0.01)
      // For 1000: clusterSize = 10, rounds to nearest 10 → 1000
      const cluster = getAmountCluster(1000);
      expect(cluster).toBe(1000);
    });

    it('should produce different clusters for distant values', () => {
      const cluster1 = getAmountCluster(1000);
      const cluster2 = getAmountCluster(2000);
      expect(cluster1).not.toBe(cluster2);
    });
  });

  describe('calculateNextOccurrence', () => {
    const base = new Date(2024, 0, 15); // Jan 15, 2024

    it('should add 1 day for DAILY', () => {
      const next = calculateNextOccurrence(base, 'DAILY');
      expect(next.getDate()).toBe(16);
    });

    it('should add 7 days for WEEKLY', () => {
      const next = calculateNextOccurrence(base, 'WEEKLY');
      expect(next.getDate()).toBe(22);
    });

    it('should add 1 month for MONTHLY', () => {
      const next = calculateNextOccurrence(base, 'MONTHLY');
      expect(next.getMonth()).toBe(1); // February
    });

    it('should add 3 months for QUARTERLY', () => {
      const next = calculateNextOccurrence(base, 'QUARTERLY');
      expect(next.getMonth()).toBe(3); // April
    });

    it('should add 1 year for YEARLY', () => {
      const next = calculateNextOccurrence(base, 'YEARLY');
      expect(next.getFullYear()).toBe(2025);
    });
  });

  describe('daysBetween', () => {
    it('should return 0 for same date', () => {
      const d = new Date(2024, 0, 1);
      expect(daysBetween(d, d)).toBe(0);
    });

    it('should calculate days correctly', () => {
      const d1 = new Date(2024, 0, 1);
      const d2 = new Date(2024, 0, 11);
      expect(daysBetween(d1, d2)).toBe(10);
    });

    it('should return absolute value (order independent)', () => {
      const d1 = new Date(2024, 0, 1);
      const d2 = new Date(2024, 0, 11);
      expect(daysBetween(d1, d2)).toBe(daysBetween(d2, d1));
    });
  });

  describe('isPotentialDuplicate', () => {
    const tx1 = {
      entityName: 'Acme Corp',
      amount: 1000,
      date: new Date(2024, 0, 15),
    };

    it('should detect duplicate (same entity, amount, within window)', () => {
      const tx2 = {
        entityName: 'Acme Corp',
        amount: 1000,
        date: new Date(2024, 0, 16),
      };
      expect(isPotentialDuplicate(tx1, tx2)).toBe(true);
    });

    it('should not flag different entities', () => {
      const tx2 = {
        entityName: 'Other Corp',
        amount: 1000,
        date: new Date(2024, 0, 16),
      };
      expect(isPotentialDuplicate(tx1, tx2)).toBe(false);
    });

    it('should not flag different amounts', () => {
      const tx2 = {
        entityName: 'Acme Corp',
        amount: 5000,
        date: new Date(2024, 0, 16),
      };
      expect(isPotentialDuplicate(tx1, tx2)).toBe(false);
    });

    it('should not flag transactions outside date window', () => {
      const tx2 = {
        entityName: 'Acme Corp',
        amount: 1000,
        date: new Date(2024, 0, 25), // 10 days later
      };
      expect(isPotentialDuplicate(tx1, tx2, 3)).toBe(false);
    });

    it('should match normalized entity names', () => {
      const tx2 = {
        entityName: 'ACME CORPORATION',
        amount: 1000,
        date: new Date(2024, 0, 15),
      };
      expect(isPotentialDuplicate(tx1, tx2)).toBe(true);
    });
  });

  describe('generatePatternHash', () => {
    it('should be consistent', () => {
      const hash1 = generatePatternHash('Monthly rent');
      const hash2 = generatePatternHash('Monthly rent');
      expect(hash1).toBe(hash2);
    });

    it('should be case-insensitive', () => {
      const hash1 = generatePatternHash('RENT');
      const hash2 = generatePatternHash('rent');
      expect(hash1).toBe(hash2);
    });

    it('should pad to 8 characters', () => {
      const hash = generatePatternHash('test');
      expect(hash.length).toBe(8);
    });
  });
});
