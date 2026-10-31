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
  safeColor,
  type DocumentLocale,
  documentDirection,
  documentFontStack,
  intlLocaleFor,
} from './base.template';

const INVOICE_LABELS: Record<DocumentLocale, Record<string, string>> = {
  en: {
    invoice: 'INVOICE',
    titlePrefix: 'Invoice',
    billTo: 'Bill To',
    taxId: 'Tax ID',
    invoiceDate: 'Invoice Date:',
    dueDate: 'Due Date:',
    balanceDue: 'Balance Due:',
    notes: 'Notes',
    terms: 'Terms & Conditions',
  },
  ar: {
    invoice: 'فاتورة',
    titlePrefix: 'فاتورة',
    billTo: 'فاتورة إلى',
    taxId: 'الرقم الضريبي',
    invoiceDate: 'تاريخ الفاتورة:',
    dueDate: 'تاريخ الاستحقاق:',
    balanceDue: 'الرصيد المستحق:',
    notes: 'ملاحظات',
    terms: 'الشروط والأحكام',
  },
};

const INVOICE_STATUS_LABELS: Record<DocumentLocale, Record<string, string>> = {
  en: {
    DRAFT: 'DRAFT',
    SENT: 'SENT',
    PAID: 'PAID',
    PARTIALLY_PAID: 'PARTIALLY PAID',
    OVERDUE: 'OVERDUE',
    VOID: 'VOID',
  },
  ar: {
    DRAFT: 'مسودة',
    SENT: 'مرسلة',
    PAID: 'مدفوعة',
    PARTIALLY_PAID: 'مدفوعة جزئيًا',
    OVERDUE: 'متأخرة',
    VOID: 'ملغاة',
  },
};

export interface InvoiceData {
  invoiceNumber: string;
  date: Date | string;
  dueDate: Date | string;
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
  balanceDue: number;
  currency: string;
  notes?: string;
  terms?: string;
}

/**
 * Invoice document. `locale` sets the language, `<html lang dir>`, number and date formats
 * (Western digits in Arabic too) and the font stack; amounts use `invoice.currency`.
 */
export function generateInvoiceHtml(
  org: OrganizationInfo,
  invoice: InvoiceData,
  locale: DocumentLocale = 'en',
): string {
  const primaryColor = safeColor(org.primaryColor, defaultTemplateConfig.colors.primary);
  const l = INVOICE_LABELS[locale];
  const dir = documentDirection(locale);
  const dateLocale = intlLocaleFor(locale);
  const money = (value: number) => formatCurrency(value, invoice.currency, locale);
  const statusLabel = INVOICE_STATUS_LABELS[locale][invoice.status] ?? invoice.status;

  const statusColors: Record<string, string> = {
    DRAFT: '#9CA3AF',
    SENT: '#3B82F6',
    PAID: '#10B981',
    PARTIALLY_PAID: '#F59E0B',
    OVERDUE: '#EF4444',
    VOID: '#6B7280',
  };

  const statusColor = statusColors[invoice.status] || statusColors.DRAFT;

  return `
    <!DOCTYPE html>
    <html lang="${locale}" dir="${dir}">
    <head>
      <meta charset="UTF-8">
      <title>${l.titlePrefix} ${escapeHtml(invoice.invoiceNumber)}</title>
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

        <!-- Invoice Title and Status -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <div>
            <h2 style="font-size: 28px; color: ${primaryColor}; margin-bottom: 5px;">${l.invoice}</h2>
            <p style="color: #6B7280; font-size: 14px;">${escapeHtml(invoice.invoiceNumber)}</p>
          </div>
          <div style="background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${escapeHtml(statusLabel)}
          </div>
        </div>

        <!-- Invoice Details and Customer Info -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.billTo}</h4>
            <p style="font-weight: bold; margin-bottom: 5px;"><bdi>${escapeHtml(invoice.customer.name)}</bdi></p>
            ${invoice.customer.address ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(invoice.customer.address)}</p>` : ''}
            ${invoice.customer.city && invoice.customer.country ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(invoice.customer.city)}, ${escapeHtml(invoice.customer.country)}</p>` : ''}
            ${invoice.customer.email ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(invoice.customer.email)}</p>` : ''}
            ${invoice.customer.phone ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(invoice.customer.phone)}</p>` : ''}
            ${invoice.customer.taxId ? `<p style="color: #6B7280; font-size: 12px;">${l.taxId}: ${escapeHtml(invoice.customer.taxId)}</p>` : ''}
          </div>
          <div style="text-align: end;">
            <table style="margin-inline-start: auto;">
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: #6B7280; font-size: 12px;">${l.invoiceDate}</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(invoice.date, dateLocale)}</td>
              </tr>
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: #6B7280; font-size: 12px;">${l.dueDate}</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(invoice.dueDate, dateLocale)}</td>
              </tr>
              <tr>
                <td style="padding-block: 5px; padding-inline-end: 20px; color: #6B7280; font-size: 12px;">${l.balanceDue}</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: bold; color: ${invoice.balanceDue > 0 ? '#EF4444' : '#10B981'};">
                  ${money(invoice.balanceDue)}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Items Table -->
        ${generateItemsTableHtml(invoice.lines, invoice.currency, true, primaryColor, locale)}

        <!-- Totals -->
        ${generateTotalsHtml(
          invoice.subtotal,
          invoice.taxAmount,
          invoice.grandTotal,
          invoice.currency,
          invoice.shippingAmount,
          undefined,
          locale,
        )}

        <!-- Notes and Terms -->
        ${
          invoice.notes
            ? `
          <div style="margin-top: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.notes}</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;"><bdi>${escapeHtml(invoice.notes)}</bdi></p>
          </div>
        `
            : ''
        }

        ${
          invoice.terms
            ? `
          <div style="margin-top: 20px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">${l.terms}</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;"><bdi>${escapeHtml(invoice.terms)}</bdi></p>
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
