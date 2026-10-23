import {
  isRightAligned,
  isRtlComputedStyle,
  resolveBillFormLabels,
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

  describe('resolveBillFormLabels', () => {
    it('returns canonical strings from catalog when present', () => {
      const catalog = {
        bills: {
          form: {
            newBill: 'فاتورة جديدة مخصصة',
            vendor: 'المورد المخصص',
            date: 'تاريخ مخصص',
            dueDate: 'استحقاق مخصص',
            reference: 'مرجع مخصص',
            currency: 'عملة مخصصة',
            lineItems: 'بنود مخصصة',
            addLine: 'إضافة مخصصة',
            cancel: 'إلغاء مخصص',
            createBill: 'إنشاء مخصص',
            notes: 'ملاحظات مخصصة',
            subtotal: 'فرعي مخصص',
            tax: 'ضريبة مخصصة',
            total: 'إجمالي مخصص',
          },
          lineItems: {
            item: 'صنف مخصص',
            account: 'حساب مخصص',
            description: 'وصف مخصص',
            quantity: 'كمية مخصصة',
            rate: 'سعر مخصص',
            tax: 'ضريبة مخصصة',
            amount: 'مبلغ مخصص',
          },
        },
      };
      const labels = resolveBillFormLabels(catalog);
      expect(labels.billTitle).toBe('فاتورة جديدة مخصصة');
      expect(labels.vendor).toBe('المورد المخصص');
      expect(labels.billDate).toBe('تاريخ مخصص');
      expect(labels.dueDate).toBe('استحقاق مخصص');
      expect(labels.reference).toBe('مرجع مخصص');
      expect(labels.currency).toBe('عملة مخصصة');
      expect(labels.lineItemsTitle).toBe('بنود مخصصة');
      expect(labels.itemColumn).toBe('صنف مخصص');
      expect(labels.accountColumn).toBe('حساب مخصص');
      expect(labels.descriptionColumn).toBe('وصف مخصص');
      expect(labels.qtyColumn).toBe('كمية مخصصة');
      expect(labels.rateColumn).toBe('سعر مخصص');
      expect(labels.amountColumn).toBe('مبلغ مخصص');
      expect(labels.taxRateColumn).toBe('ضريبة مخصصة');
      expect(labels.totalColumn).toBe('مبلغ مخصص');
      expect(labels.addLine).toBe('إضافة مخصصة');
      expect(labels.cancel).toBe('إلغاء مخصص');
      expect(labels.createBill).toBe('إنشاء مخصص');
      expect(labels.notes).toBe('ملاحظات مخصصة');
      expect(labels.subtotal).toBe('فرعي مخصص');
      expect(labels.tax).toBe('ضريبة مخصصة');
      expect(labels.total).toBe('إجمالي مخصص');
    });

    it('returns default canonical strings when catalog entry is missing or empty', () => {
      const labels = resolveBillFormLabels(null);
      expect(labels.billTitle).toBe('فاتورة جديدة');
      expect(labels.vendor).toBe('المورد');
      expect(labels.accountColumn).toBe('الحساب');
      expect(labels.itemColumn).toBe('الصنف');
      expect(labels.addLine).toBe('إضافة سطر');
      expect(labels.createBill).toBe('إنشاء فاتورة');

      const labels2 = resolveBillFormLabels({});
      expect(labels2.accountColumn).toBe('الحساب');

      const labels3 = resolveBillFormLabels({ bills: {} });
      expect(labels3.accountColumn).toBe('الحساب');

      const labels4 = resolveBillFormLabels({ bills: { form: {}, lineItems: {} } });
      expect(labels4.accountColumn).toBe('الحساب');
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