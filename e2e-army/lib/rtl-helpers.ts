/**
 * RTL layout and geometry helper utilities for E2E and visual tests.
 */

export interface BoundingBox {
  x: number;
  width: number;
  y?: number;
  height?: number;
}

export interface ComputedLayoutStyles {
  direction?: string;
  textAlign?: string;
}

export interface MarginStyles {
  marginLeft?: string;
  marginRight?: string;
  marginInlineStart?: string;
  marginInlineEnd?: string;
}

export interface BillFormCatalogStructure {
  bills?: {
    form?: {
      vendor?: string;
      date?: string;
      dueDate?: string;
      reference?: string;
      currency?: string;
      lineItems?: string;
      addLine?: string;
      cancel?: string;
      createBill?: string;
      notes?: string;
      subtotal?: string;
      tax?: string;
      total?: string;
      newBill?: string;
    };
    lineItems?: {
      item?: string;
      account?: string;
      description?: string;
      quantity?: string;
      rate?: string;
      tax?: string;
      amount?: string;
    };
  };
}

/**
 * Checks whether child element bounding box is positioned closer to container's right edge than its left edge.
 * In RTL layout, aligned elements sit closer to right edge (rightGap < leftGap).
 */
export function isRightAligned(
  containerBox: BoundingBox | null | undefined,
  childBox: BoundingBox | null | undefined,
): boolean {
  if (!containerBox || !childBox) return false;
  const rightGap = containerBox.x + containerBox.width - (childBox.x + childBox.width);
  const leftGap = childBox.x - containerBox.x;
  return rightGap < leftGap;
}

/**
 * Validates computed CSS direction and text alignment for RTL content.
 */
export function isRtlComputedStyle(styles: ComputedLayoutStyles | null | undefined): boolean {
  if (!styles) return false;
  const direction = (styles.direction ?? '').toLowerCase().trim();
  const textAlign = (styles.textAlign ?? '').toLowerCase().trim();

  if (direction !== 'rtl') return false;
  return ['right', 'start', ''].includes(textAlign);
}

/**
 * Resolves the canonical bill form Arabic labels from catalog with fallbacks.
 */
export function resolveBillFormLabels(catalog?: BillFormCatalogStructure | null): {
  billTitle: string;
  vendor: string;
  billDate: string;
  dueDate: string;
  reference: string;
  currency: string;
  lineItemsTitle: string;
  itemColumn: string;
  accountColumn: string;
  descriptionColumn: string;
  qtyColumn: string;
  rateColumn: string;
  amountColumn: string;
  taxRateColumn: string;
  totalColumn: string;
  addLine: string;
  cancel: string;
  createBill: string;
  notes: string;
  subtotal: string;
  tax: string;
  total: string;
} {
  const bills = catalog?.bills ?? {};
  const form = bills.form ?? {};
  const lineItems = bills.lineItems ?? {};

  return {
    billTitle: form.newBill ?? 'فاتورة جديدة',
    vendor: form.vendor ?? 'المورد',
    billDate: form.date ?? 'تاريخ الفاتورة',
    dueDate: form.dueDate ?? 'تاريخ الاستحقاق',
    reference: form.reference ?? 'المرجع (رقم وثيقة المورد)',
    currency: form.currency ?? 'العملة',
    lineItemsTitle: form.lineItems ?? 'بنود الفاتورة',
    itemColumn: lineItems.item ?? 'الصنف',
    accountColumn: lineItems.account ?? 'الحساب',
    descriptionColumn: lineItems.description ?? 'الوصف',
    qtyColumn: lineItems.quantity ?? 'الكمية',
    rateColumn: lineItems.rate ?? 'السعر',
    amountColumn: lineItems.amount ?? 'المبلغ',
    taxRateColumn: lineItems.tax ?? 'نسبة الضريبة',
    totalColumn: lineItems.amount ?? 'الإجمالي',
    addLine: form.addLine ?? 'إضافة سطر',
    cancel: form.cancel ?? 'إلغاء',
    createBill: form.createBill ?? 'إنشاء فاتورة',
    notes: form.notes ?? 'ملاحظات',
    subtotal: form.subtotal ?? 'المجموع الفرعي',
    tax: form.tax ?? 'الضريبة',
    total: form.total ?? 'الإجمالي',
  };
}

/**
 * Normalizes Arabic text with Unicode NFC and trims surrounding whitespace.
 */
export function normalizeArabicText(text: string | null | undefined): string {
  if (!text) return '';
  return text.normalize('NFC').trim();
}

/**
 * Validates that margin inline and direction properties conform to RTL layout.
 */
export function isRtlMarginDirection(margins: MarginStyles | null | undefined): boolean {
  if (!margins) return false;
  return Boolean(
    margins.marginInlineStart !== undefined ||
      margins.marginInlineEnd !== undefined ||
      margins.marginLeft === 'auto' ||
      margins.marginRight === '0px' ||
      margins.marginRight === 'auto',
  );
}