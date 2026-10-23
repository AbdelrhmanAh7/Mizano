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

export interface CatalogStructure {
  expenses?: {
    form?: {
      account?: string;
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
 * Resolves the canonical expense account Arabic label from catalog with fallback.
 */
export function resolveExpenseAccountLabel(catalog?: CatalogStructure | null): string {
  return catalog?.expenses?.form?.account ?? 'حساب المصروفات';
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
