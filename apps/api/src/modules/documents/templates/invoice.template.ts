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
} from './base.template';

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

export function generateInvoiceHtml(org: OrganizationInfo, invoice: InvoiceData): string {
  const primaryColor = org.primaryColor || defaultTemplateConfig.colors.primary;

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
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
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

        <!-- Invoice Title and Status -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <div>
            <h2 style="font-size: 28px; color: ${primaryColor}; margin-bottom: 5px;">INVOICE</h2>
            <p style="color: #6B7280; font-size: 14px;">${invoice.invoiceNumber}</p>
          </div>
          <div style="background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${invoice.status}
          </div>
        </div>

        <!-- Invoice Details and Customer Info -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Bill To</h4>
            <p style="font-weight: bold; margin-bottom: 5px;">${invoice.customer.name}</p>
            ${invoice.customer.address ? `<p style="color: #6B7280; font-size: 12px;">${invoice.customer.address}</p>` : ''}
            ${invoice.customer.city && invoice.customer.country ? `<p style="color: #6B7280; font-size: 12px;">${invoice.customer.city}, ${invoice.customer.country}</p>` : ''}
            ${invoice.customer.email ? `<p style="color: #6B7280; font-size: 12px;">${invoice.customer.email}</p>` : ''}
            ${invoice.customer.phone ? `<p style="color: #6B7280; font-size: 12px;">${invoice.customer.phone}</p>` : ''}
            ${invoice.customer.taxId ? `<p style="color: #6B7280; font-size: 12px;">Tax ID: ${invoice.customer.taxId}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <table style="margin-left: auto;">
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Invoice Date:</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(invoice.date)}</td>
              </tr>
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Due Date:</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(invoice.dueDate)}</td>
              </tr>
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Balance Due:</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: bold; color: ${invoice.balanceDue > 0 ? '#EF4444' : '#10B981'};">
                  ${formatCurrency(invoice.balanceDue, invoice.currency)}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Items Table -->
        ${generateItemsTableHtml(invoice.lines, invoice.currency, true, primaryColor)}

        <!-- Totals -->
        ${generateTotalsHtml(
          invoice.subtotal,
          invoice.taxAmount,
          invoice.grandTotal,
          invoice.currency,
          invoice.shippingAmount,
        )}

        <!-- Notes and Terms -->
        ${
          invoice.notes
            ? `
          <div style="margin-top: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Notes</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;">${invoice.notes}</p>
          </div>
        `
            : ''
        }

        ${
          invoice.terms
            ? `
          <div style="margin-top: 20px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Terms & Conditions</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;">${invoice.terms}</p>
          </div>
        `
            : ''
        }

        ${generateFooterHtml(org, primaryColor)}
      </div>
    </body>
    </html>
  `;
}
