import { BRAND_COLORS } from '@mizano/shared-types';
import {
  OrganizationInfo,
  DocumentLineItem,
  formatCurrency,
  formatDate,
  generateHeaderHtml,
  generateFooterHtml,
  generateItemsTableHtml,
  generateTotalsHtml,
  defaultTemplateConfig,
  escapeHtml,
  renderAddressHtml,
  safeColor,
  type DocumentCopy,
  type DocumentLocale,
  documentDirection,
  documentFontStack,
  intlLocaleFor,
} from './base.template';

/** Every printed string of the bill, in both languages; `status` is keyed by the schema enum. */
type BillLabel =
  | 'bill'
  | 'titlePrefix'
  | 'fromVendor'
  | 'taxId'
  | 'billDate'
  | 'dueDate'
  | 'balanceDue'
  | 'notes';

const BILL_LABELS: Record<DocumentLocale, DocumentCopy<BillLabel>> = {
  en: {
    bill: 'BILL',
    titlePrefix: 'Bill',
    fromVendor: 'From (Vendor)',
    taxId: 'Tax ID',
    billDate: 'Bill Date:',
    dueDate: 'Due Date:',
    balanceDue: 'Balance Due:',
    notes: 'Notes',
    status: {
      DRAFT: 'DRAFT',
      PENDING: 'PENDING',
      OPEN: 'OPEN',
      PARTIALLY_PAID: 'PARTIALLY PAID',
      PAID: 'PAID',
      OVERDUE: 'OVERDUE',
      VOID: 'VOID',
    },
  },
  ar: {
    bill: 'فاتورة مورد',
    titlePrefix: 'فاتورة مورد',
    fromVendor: 'من (المورد)',
    taxId: 'الرقم الضريبي',
    billDate: 'تاريخ الفاتورة:',
    dueDate: 'تاريخ الاستحقاق:',
    balanceDue: 'الرصيد المستحق:',
    notes: 'ملاحظات',
    status: {
      DRAFT: 'مسودة',
      PENDING: 'معلقة',
      OPEN: 'مفتوحة',
      PARTIALLY_PAID: 'مدفوعة جزئيًا',
      PAID: 'مدفوعة',
      OVERDUE: 'متأخرة',
      VOID: 'ملغاة',
    },
  },
};

export interface BillData {
  billNumber: string;
  date: Date | string;
  dueDate: Date | string;
  status: string;
  vendor: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    taxId?: string;
  };
  lines: DocumentLineItem[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  balanceDue: number;
  currency: string;
  notes?: string;
}

/**
 * Bill document. `locale` sets the language, `<html lang dir>`, number and date formats and
 * the font stack; Arabic prints the organization's digits (`org.documentDigits`), English always
 * Western ones. Amounts use `bill.currency`.
 */
export function generateBillHtml(
  org: OrganizationInfo,
  bill: BillData,
  locale: DocumentLocale = 'en',
): string {
  const primaryColor = safeColor(org.primaryColor, defaultTemplateConfig.colors.primary);
  const l = BILL_LABELS[locale];
  const dir = documentDirection(locale);
  const digits = org.documentDigits ?? 'latn';
  const dateLocale = intlLocaleFor(locale, digits);
  const statusLabel = l.status[bill.status] ?? bill.status;

  const statusColors: Record<string, string> = {
    DRAFT: BRAND_COLORS.muted,
    PENDING: BRAND_COLORS.muted,
    OPEN: BRAND_COLORS.info,
    PAID: BRAND_COLORS.success,
    PARTIALLY_PAID: BRAND_COLORS.warning,
    OVERDUE: BRAND_COLORS.danger,
    VOID: BRAND_COLORS.muted,
  };

  const statusColor = statusColors[bill.status] || statusColors.DRAFT;

  return `
    <!DOCTYPE html>
    <html lang="${locale}" dir="${dir}">
    <head>
      <meta charset="UTF-8">
      <title>${l.titlePrefix} ${escapeHtml(bill.billNumber)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${documentFontStack(locale)}; color: #111827; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px; }
        @media print {
          .container { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${generateHeaderHtml(org, primaryColor, locale)}

        <!-- Bill Title and Status -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <div>
            <h2 style="font-size: 28px; color: ${primaryColor}; margin-bottom: 5px;">${l.bill}</h2>
            <p style="color: ${BRAND_COLORS.muted}; font-size: 14px;">${escapeHtml(bill.billNumber)}</p>
          </div>
          <div style="background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${escapeHtml(statusLabel)}
          </div>
        </div>

        <!-- Bill Details and Vendor Info -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.fromVendor}</h4>
            <p style="font-weight: bold; margin-bottom: 5px;"><bdi>${escapeHtml(bill.vendor.name)}</bdi></p>
            ${renderAddressHtml(bill.vendor, 'color: ${BRAND_COLORS.muted}; font-size: 12px;')}
            ${bill.vendor.email ? `<p style="color: ${BRAND_COLORS.muted}; font-size: 12px;">${escapeHtml(bill.vendor.email)}</p>` : ''}
            ${bill.vendor.phone ? `<p style="color: ${BRAND_COLORS.muted}; font-size: 12px;">${escapeHtml(bill.vendor.phone)}</p>` : ''}
            ${bill.vendor.taxId ? `<p style="color: ${BRAND_COLORS.muted}; font-size: 12px;">${l.taxId}: ${escapeHtml(bill.vendor.taxId)}</p>` : ''}
          </div>
          <div style="text-align: end;">
            <table style="margin-inline-start: auto;">
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: ${BRAND_COLORS.muted}; font-size: 12px;">${l.billDate}</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(bill.date, dateLocale)}</td>
              </tr>
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: ${BRAND_COLORS.muted}; font-size: 12px;">${l.dueDate}</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(bill.dueDate, dateLocale)}</td>
              </tr>
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: ${BRAND_COLORS.muted}; font-size: 12px;">${l.balanceDue}</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: bold; color: ${bill.balanceDue > 0 ? BRAND_COLORS.danger : BRAND_COLORS.success};">
                  ${formatCurrency(bill.balanceDue, bill.currency, locale, digits)}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Items Table -->
        ${generateItemsTableHtml(bill.lines, bill.currency, true, primaryColor, locale, digits)}

        <!-- Totals -->
        ${generateTotalsHtml(
          bill.subtotal,
          bill.taxAmount,
          bill.grandTotal,
          bill.currency,
          undefined,
          undefined,
          locale,
          digits,
        )}

        <!-- Notes -->
        ${
          bill.notes
            ? `
          <div style="margin-top: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.notes}</h4>
            <p style="color: ${BRAND_COLORS.muted}; font-size: 12px; white-space: pre-line;"><bdi>${escapeHtml(bill.notes)}</bdi></p>
          </div>
        `
            : ''
        }

        ${generateFooterHtml(org, primaryColor, locale)}
      </div>
    </body>
    </html>
  `;
}
