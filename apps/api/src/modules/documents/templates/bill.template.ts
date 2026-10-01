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

export function generateBillHtml(org: OrganizationInfo, bill: BillData): string {
  const primaryColor = safeColor(org.primaryColor, defaultTemplateConfig.colors.primary);

  const statusColors: Record<string, string> = {
    DRAFT: '#9CA3AF',
    OPEN: '#3B82F6',
    PAID: '#10B981',
    PARTIALLY_PAID: '#F59E0B',
    OVERDUE: '#EF4444',
    VOID: '#6B7280',
  };

  const statusColor = statusColors[bill.status] || statusColors.DRAFT;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Bill ${escapeHtml(bill.billNumber)}</title>
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

        <!-- Bill Title and Status -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <div>
            <h2 style="font-size: 28px; color: ${primaryColor}; margin-bottom: 5px;">BILL</h2>
            <p style="color: #6B7280; font-size: 14px;">${escapeHtml(bill.billNumber)}</p>
          </div>
          <div style="background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${escapeHtml(bill.status)}
          </div>
        </div>

        <!-- Bill Details and Vendor Info -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">From (Vendor)</h4>
            <p style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(bill.vendor.name)}</p>
            ${bill.vendor.address ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(bill.vendor.address)}</p>` : ''}
            ${bill.vendor.city && bill.vendor.country ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(bill.vendor.city)}, ${escapeHtml(bill.vendor.country)}</p>` : ''}
            ${bill.vendor.email ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(bill.vendor.email)}</p>` : ''}
            ${bill.vendor.phone ? `<p style="color: #6B7280; font-size: 12px;">${escapeHtml(bill.vendor.phone)}</p>` : ''}
            ${bill.vendor.taxId ? `<p style="color: #6B7280; font-size: 12px;">Tax ID: ${escapeHtml(bill.vendor.taxId)}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <table style="margin-left: auto;">
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Bill Date:</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(bill.date)}</td>
              </tr>
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Due Date:</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: bold;">${formatDate(bill.dueDate)}</td>
              </tr>
              <tr>
                <td style="padding: 5px 20px 5px 0; color: #6B7280; font-size: 12px;">Balance Due:</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: bold; color: ${bill.balanceDue > 0 ? '#EF4444' : '#10B981'};">
                  ${formatCurrency(bill.balanceDue, bill.currency)}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Items Table -->
        ${generateItemsTableHtml(bill.lines, bill.currency, true, primaryColor)}

        <!-- Totals -->
        ${generateTotalsHtml(bill.subtotal, bill.taxAmount, bill.grandTotal, bill.currency)}

        <!-- Notes -->
        ${
          bill.notes
            ? `
          <div style="margin-top: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Notes</h4>
            <p style="color: #6B7280; font-size: 12px; white-space: pre-line;">${escapeHtml(bill.notes)}</p>
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
