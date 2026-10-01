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
} from './base.template';

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

export function generateQuoteHtml(org: OrganizationInfo, quote: QuoteData): string {
  const primaryColor = safeColor(org.primaryColor, defaultTemplateConfig.colors.primary);

  const statusColors: Record<string, string> = {
    DRAFT: '#9CA3AF',
    SENT: '#3B82F6',
    ACCEPTED: '#10B981',
    REJECTED: '#EF4444',
    EXPIRED: '#6B7280',
    CONVERTED: '#8B5CF6',
  };

  const statusColor = statusColors[quote.status] || statusColors.DRAFT;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Quote ${escapeHtml(quote.quoteNumber)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px; }
        @media print {
          .container { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${generateHeaderHtml(org, primaryColor)}

        <!-- Quote Title and Status -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <div>
            <h2 style="font-size: 28px; color: ${primaryColor}; margin-bottom: 5px;">QUOTATION</h2>
            <p style="color: #6B7280; font-size: 14px;">${escapeHtml(quote.quoteNumber)}</p>
          </div>
          <div style="background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${escapeHtml(quote.status)}
          </div>
        </div>

        <!-- Quote Details and Customer Info -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Prepared For</h4>
            <p style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(quote.customer.name)}</p>
            ${quote.customer.address ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(quote.customer.address)}</p>` : ''}
            ${quote.customer.city && quote.customer.country ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(quote.customer.city)}, ${escapeHtml(quote.customer.country)}</p>` : ''}
            ${quote.customer.email ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(quote.customer.email)}</p>` : ''}
            ${quote.customer.phone ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(quote.customer.phone)}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <table style="margin-left: auto;">
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Quote Date:</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(quote.date)}</td>
              </tr>
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Valid Until:</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(quote.expiryDate)}</td>
              </tr>
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Total:</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: bold; color: ${primaryColor};">
                  ${formatCurrency(quote.grandTotal, quote.currency)}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Items Table -->
        ${generateItemsTableHtml(quote.lines, quote.currency, true, primaryColor)}

        <!-- Totals -->
        ${generateTotalsHtml(
          quote.subtotal,
          quote.taxAmount,
          quote.grandTotal,
          quote.currency,
          quote.shippingAmount,
        )}

        <!-- Notes and Terms -->
        ${
          quote.notes
            ? `
          <div style="margin-top: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Notes</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;">${escapeHtml(quote.notes)}</p>
          </div>
        `
            : ''
        }

        ${
          quote.terms
            ? `
          <div style="margin-top: 20px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Terms & Conditions</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;">${escapeHtml(quote.terms)}</p>
          </div>
        `
            : ''
        }

        <!-- Acceptance Section -->
        <div style="margin-top: 40px; padding: 20px; background: ${defaultTemplateConfig.colors.lightGray}; border-radius: 8px;">
          <h4 style="color: ${primaryColor}; margin-bottom: 15px; font-size: 12px; text-transform: uppercase;">Acceptance</h4>
          <p style="color: #6B7280; font-size: 12px; margin-bottom: 20px;">
            If you would like to proceed with this quote, please sign below and return a copy to us.
          </p>
          <div style="display: flex; justify-content: space-between; margin-top: 30px;">
            <div style="flex: 1; border-bottom: 1px solid #9CA3AF; margin-right: 40px; padding-bottom: 5px;">
              <p style="color: #9CA3AF; font-size: 10px;">Signature</p>
            </div>
            <div style="flex: 1; border-bottom: 1px solid #9CA3AF; padding-bottom: 5px;">
              <p style="color: #9CA3AF; font-size: 10px;">Date</p>
            </div>
          </div>
        </div>

        ${generateFooterHtml(org, primaryColor)}
      </div>
    </body>
    </html>
  `;
}
