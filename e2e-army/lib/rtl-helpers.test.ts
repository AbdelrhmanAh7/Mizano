import {
  isRightAligned,
  isRtlComputedStyle,
  resolveExpenseAccountLabel,
  normalizeArabicText,
  isRtlMarginDirection,
} from './rtl-helpers';

describe('rtl-helpers', () => {
  describe('isRightAligned', () => {
    it('returns true when element is positioned closer to container right edge than left edge', () => {
      const containerBox = { x: 0, width: 1000 };
      const childBox = { x: 700, width: 200 }; // leftGap = 700, rightGap = 100
      expect(isRightAligned(containerBox, childBox)).toBe(true);
    });

    it('returns false when element is positioned closer to container left edge than right edge', () => {
      const containerBox = { x: 0, width: 1000 };
      const childBox = { x: 100, width: 200 }; // leftGap = 100, rightGap = 700
      expect(isRightAligned(containerBox, childBox)).toBe(false);
    });

    it('returns false when element is perfectly centered', () => {
      const containerBox = { x: 0, width: 1000 };
      const childBox = { x: 400, width: 200 }; // leftGap = 400, rightGap = 400
      expect(isRightAligned(containerBox, childBox)).toBe(false);
    });

    it('returns false when either box is missing', () => {
      expect(isRightAligned(null, { x: 100, width: 200 })).toBe(false);
      expect(isRightAligned({ x: 0, width: 1000 }, null)).toBe(false);
      expect(isRightAligned(undefined, undefined)).toBe(false);
    });
  });

  describe('isRtlComputedStyle', () => {
    it('returns true for direction rtl and text-align right', () => {
      expect(isRtlComputedStyle({ direction: 'rtl', textAlign: 'right' })).toBe(true);
    });

    it('returns true for direction rtl and text-align start', () => {
      expect(isRtlComputedStyle({ direction: 'rtl', textAlign: 'start' })).toBe(true);
    });

    it('returns false for direction ltr even if text-align is right', () => {
      expect(isRtlComputedStyle({ direction: 'ltr', textAlign: 'right' })).toBe(false);
    });

    it('returns false for direction rtl and text-align left', () => {
      expect(isRtlComputedStyle({ direction: 'rtl', textAlign: 'left' })).toBe(false);
    });

    it('returns false for null or undefined input', () => {
      expect(isRtlComputedStyle(null)).toBe(false);
      expect(isRtlComputedStyle(undefined)).toBe(false);
    });
  });

  describe('resolveExpenseAccountLabel', () => {
    it('returns canonical string from catalog when present', () => {
      const catalog = {
        expenses: {
          form: {
            account: 'حساب المصروفات الرسمي',
          },
        },
      };
      expect(resolveExpenseAccountLabel(catalog)).toBe('حساب المصروفات الرسمي');
    });

    it('returns default canonical string when catalog entry is missing or empty', () => {
      expect(resolveExpenseAccountLabel(null)).toBe('حساب المصروفات');
      expect(resolveExpenseAccountLabel({})).toBe('حساب المصروفات');
      expect(resolveExpenseAccountLabel({ expenses: {} })).toBe('حساب المصروفات');
    });
  });

  describe('normalizeArabicText', () => {
    it('trims whitespace and normalizes Unicode NFC', () => {
      const input = '   حساب المصروفات\t\n ';
      expect(normalizeArabicText(input)).toBe('حساب المصروفات');
    });

    it('handles null or undefined safely', () => {
      expect(normalizeArabicText(null)).toBe('');
      expect(normalizeArabicText(undefined)).toBe('');
    });
  });

  describe('isRtlMarginDirection', () => {
    it('returns true when margin-inline-start is defined and valid', () => {
      expect(isRtlMarginDirection({ marginInlineStart: '16px' })).toBe(true);
    });

    it('returns true for auto margins or zero margins', () => {
      expect(isRtlMarginDirection({ marginLeft: 'auto', marginRight: '0px' })).toBe(true);
    });

    it('returns false for missing input', () => {
      expect(isRtlMarginDirection(null)).toBe(false);
    });
  });
});
