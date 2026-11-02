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

/** Every printed string of the quote, in both languages; `status` is keyed by the schema enum. */
type QuoteLabel =
  | 'quote'
  | 'titlePrefix'
  | 'preparedFor'
  | 'taxId'
  | 'quoteDate'
  | 'validUntil'
  | 'total'
  | 'notes'
  | 'terms'
  | 'acceptance'
  | 'acceptanceText'
  | 'signature'
  | 'date';

const QUOTE_LABELS: Record<DocumentLocale, DocumentCopy<QuoteLabel>> = {
  en: {
    quote: 'QUOTATION',
    titlePrefix: 'Quote',
    preparedFor: 'Prepared For',
    taxId: 'Tax ID',
    quoteDate: 'Quote Date:',
    validUntil: 'Valid Until:',
    total: 'Total:',
    notes: 'Notes',
    terms: 'Terms & Conditions',
    acceptance: 'Acceptance',
    acceptanceText:
      'If you would like to proceed with this quote, please sign below and return a copy to us.',
    signature: 'Signature',
    date: 'Date',
    status: {
      DRAFT: 'DRAFT',
      SENT: 'SENT',
      ACCEPTED: 'ACCEPTED',
      INVOICED: 'INVOICED',
      DECLINED: 'DECLINED',
      EXPIRED: 'EXPIRED',
    },
  },
  ar: {
    quote: 'عرض سعر',
    titlePrefix: 'عرض سعر',
    preparedFor: 'مقدَّم إلى',
    taxId: 'الرقم الضريبي',
    quoteDate: 'تاريخ العرض:',
    validUntil: 'صالح حتى:',
    total: 'الإجمالي:',
    notes: 'ملاحظات',
    terms: 'الشروط والأحكام',
    acceptance: 'الموافقة',
    acceptanceText: 'إذا رغبت في المضي في هذا العرض، يُرجى التوقيع أدناه وإعادة نسخة إلينا.',
    signature: 'التوقيع',
    date: 'التاريخ',
    status: {
      DRAFT: 'مسودة',
      SENT: 'مرسل',
      ACCEPTED: 'مقبول',
      INVOICED: 'تم إصدار فاتورة',
      DECLINED: 'مرفوض',
      EXPIRED: 'منتهي الصلاحية',
    },
  },
};

export interface QuoteData {
  quoteNumber: string;
  date: Date | string;
  expiryDate: Date | string;
  status: string;
  customer: {
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
  shippingAmount?: number;
  grandTotal: number;
  currency: string;
  notes?: string;
  terms?: string;
}

/**
 * Quote document. `locale` sets the language, `<html lang dir>`, number and date formats and
 * the font stack; Arabic prints the organization's digits (`org.documentDigits`), English always
 * Western ones. Amounts use `quote.currency`.
 */
export function generateQuoteHtml(
  org: OrganizationInfo,
  quote: QuoteData,
  locale: DocumentLocale = 'en',
): string {
  const primaryColor = safeColor(org.primaryColor, defaultTemplateConfig.colors.primary);
  const l = QUOTE_LABELS[locale];
  const dir = documentDirection(locale);
  const digits = org.documentDigits ?? 'latn';
  const dateLocale = intlLocaleFor(locale, digits);
  const statusLabel = l.status[quote.status] ?? quote.status;

  const statusColors: Record<string, string> = {
    DRAFT: '#9CA3AF',
    SENT: BRAND_COLORS.info,
    ACCEPTED: BRAND_COLORS.success,
    INVOICED: '#8B5CF6',
    DECLINED: BRAND_COLORS.danger,
    EXPIRED: '#6B7280',
  };

  const statusColor = statusColors[quote.status] || statusColors.DRAFT;

  return `
    <!DOCTYPE html>
    <html lang="${locale}" dir="${dir}">
    <head>
      <meta charset="UTF-8">
      <title>${l.titlePrefix} ${escapeHtml(quote.quoteNumber)}</title>
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

        <!-- Quote Title and Status -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <div>
            <h2 style="font-size: 28px; color: ${primaryColor}; margin-bottom: 5px;">${l.quote}</h2>
            <p style="color: #6B7280; font-size: 14px;">${escapeHtml(quote.quoteNumber)}</p>
          </div>
          <div style="background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${escapeHtml(statusLabel)}
          </div>
        </div>

        <!-- Quote Details and Customer Info -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.preparedFor}</h4>
            <p style="font-weight: bold; margin-bottom: 5px;"><bdi>${escapeHtml(quote.customer.name)}</bdi></p>
            ${renderAddressHtml(quote.customer, 'color: #6B7280; font-size: 12px;')}
            ${quote.customer.email ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(quote.customer.email)}</p>` : ''}
            ${quote.customer.phone ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(quote.customer.phone)}</p>` : ''}
            ${quote.customer.taxId ? `<p style="color: #6B7280; font-size: 12px;">${l.taxId}: ${escapeHtml(quote.customer.taxId)}</p>` : ''}
          </div>
          <div style="text-align: end;">
            <table style="margin-inline-start: auto;">
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: #6B7280; font-size: 12px;">${l.quoteDate}</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(quote.date, dateLocale)}</td>
              </tr>
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: #6B7280; font-size: 12px;">${l.validUntil}</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(quote.expiryDate, dateLocale)}</td>
              </tr>
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: #6B7280; font-size: 12px;">${l.total}</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: bold; color: ${primaryColor};">
                  ${formatCurrency(quote.grandTotal, quote.currency, locale, digits)}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Items Table -->
        ${generateItemsTableHtml(quote.lines, quote.currency, true, primaryColor, locale, digits)}

        <!-- Totals -->
        ${generateTotalsHtml(
          quote.subtotal,
          quote.taxAmount,
          quote.grandTotal,
          quote.currency,
          quote.shippingAmount,
          undefined,
          locale,
          digits,
        )}

        <!-- Notes and Terms -->
        ${
          quote.notes
            ? `
          <div style="margin-top: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.notes}</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;"><bdi>${escapeHtml(quote.notes)}</bdi></p>
          </div>
        `
            : ''
        }

        ${
          quote.terms
            ? `
          <div style="margin-top: 20px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.terms}</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;"><bdi>${escapeHtml(quote.terms)}</bdi></p>
          </div>
        `
            : ''
        }

        <!-- Acceptance Section -->
        <div style="margin-top: 40px; padding: 20px; background: ${defaultTemplateConfig.colors.lightGray}; border-radius: 8px;">
          <h4 style="color: ${primaryColor}; margin-bottom: 15px; font-size: 12px; text-transform: uppercase;">${l.acceptance}</h4>
          <p style="color: #6B7280; font-size: 12px; margin-bottom: 20px;">
            ${l.acceptanceText}
          </p>
          <div style="display: flex; justify-content: space-between; margin-top: 30px;">
            <div style="flex: 1; border-bottom: 1px solid #9CA3AF; margin-inline-end: 40px; padding-bottom: 5px;">
              <p style="color: #9CA3AF; font-size: 10px;">${l.signature}</p>
            </div>
            <div style="flex: 1; border-bottom: 1px solid #9CA3AF; padding-bottom: 5px;">
              <p style="color: #9CA3AF; font-size: 10px;">${l.date}</p>
            </div>
          </div>
        </div>

        ${generateFooterHtml(org, primaryColor, locale)}
      </div>
    </body>
    </html>
  `;
}
