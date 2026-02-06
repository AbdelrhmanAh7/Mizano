// Base template configuration for PDF generation
// Using PDFKit-compatible structure for server-side PDF generation

export interface TemplateConfig {
  pageSize: 'A4' | 'LETTER';
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  fonts: {
    regular: string;
    bold: string;
  };
  colors: {
    primary: string;
    secondary: string;
    text: string;
    lightGray: string;
    border: string;
  };
}

export const defaultTemplateConfig: TemplateConfig = {
  pageSize: 'A4',
  margins: {
    top: 50,
    bottom: 50,
    left: 50,
    right: 50,
  },
  fonts: {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
  },
  colors: {
    primary: '#3B82F6',
    secondary: '#6B7280',
    text: '#111827',
    lightGray: '#F3F4F6',
    border: '#E5E7EB',
  },
};

export interface OrganizationInfo {
  name: string;
  logoUrl?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxId?: string;
  bankDetails?: string;
  footerText?: string;
  primaryColor?: string;
  currency?: string;
}

export interface DocumentLineItem {
  description: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxRate?: number;
  amount: number;
}

// Common formatting utilities
export function formatCurrency(amount: number | string, currency: string = 'SAR'): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount);
}

export function formatDate(date: Date | string, locale: string = 'en-SA'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

export function formatShortDate(date: Date | string, locale: string = 'en-SA'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

// Generate header section for documents
export function generateHeaderHtml(org: OrganizationInfo, primaryColor?: string): string {
  const color = primaryColor || org.primaryColor || defaultTemplateConfig.colors.primary;

  return `
    <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
      <div>
        ${org.logoUrl ? `<img src="${org.logoUrl}" alt="${org.name}" style="max-height: 60px; max-width: 200px;" />` : ''}
        <h1 style="color: ${color}; margin: 10px 0 5px 0; font-size: 24px;">${org.name}</h1>
        ${org.address ? `<p style="margin: 2px 0; color: #6B7280; font-size: 12px;">${org.address}</p>` : ''}
        ${org.city && org.country ? `<p style="margin: 2px 0; color: #6B7280; font-size: 12px;">${org.city}, ${org.country}</p>` : ''}
        ${org.phone ? `<p style="margin: 2px 0; color: #6B7280; font-size: 12px;">Tel: ${org.phone}</p>` : ''}
        ${org.email ? `<p style="margin: 2px 0; color: #6B7280; font-size: 12px;">Email: ${org.email}</p>` : ''}
        ${org.taxId ? `<p style="margin: 2px 0; color: #6B7280; font-size: 12px;">Tax ID: ${org.taxId}</p>` : ''}
      </div>
    </div>
  `;
}

// Generate footer section for documents
export function generateFooterHtml(org: OrganizationInfo, primaryColor?: string): string {
  const color = primaryColor || org.primaryColor || defaultTemplateConfig.colors.primary;

  return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid ${defaultTemplateConfig.colors.border};">
      ${org.bankDetails ? `
        <div style="margin-bottom: 15px;">
          <h4 style="color: ${color}; margin-bottom: 5px; font-size: 12px;">Bank Details</h4>
          <p style="white-space: pre-line; color: #6B7280; font-size: 11px;">${org.bankDetails}</p>
        </div>
      ` : ''}
      ${org.footerText ? `
        <p style="text-align: center; color: #9CA3AF; font-size: 10px;">${org.footerText}</p>
      ` : ''}
    </div>
  `;
}

// Generate items table HTML
export function generateItemsTableHtml(
  items: DocumentLineItem[],
  currency: string = 'SAR',
  showTax: boolean = true,
  primaryColor?: string,
): string {
  const color = primaryColor || defaultTemplateConfig.colors.primary;

  const headers = [
    'Description',
    'Qty',
    'Rate',
    ...(showTax ? ['Tax %'] : []),
    'Amount',
  ];

  const headerCells = headers
    .map(
      (h, i) =>
        `<th style="padding: 10px; text-align: ${i === 0 ? 'left' : 'right'}; background: ${color}; color: white; font-size: 12px;">${h}</th>`,
    )
    .join('');

  const rows = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid ${defaultTemplateConfig.colors.border};">
        <td style="padding: 10px; font-size: 12px;">${item.description}</td>
        <td style="padding: 10px; text-align: right; font-size: 12px;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right; font-size: 12px;">${formatCurrency(item.rate, currency)}</td>
        ${showTax ? `<td style="padding: 10px; text-align: right; font-size: 12px;">${item.taxRate || 0}%</td>` : ''}
        <td style="padding: 10px; text-align: right; font-size: 12px; font-weight: bold;">${formatCurrency(item.amount, currency)}</td>
      </tr>
    `,
    )
    .join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// Generate totals section HTML
export function generateTotalsHtml(
  subtotal: number,
  taxAmount: number,
  grandTotal: number,
  currency: string = 'SAR',
  shippingAmount?: number,
  discountAmount?: number,
): string {
  const rows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Subtotal', value: formatCurrency(subtotal, currency) },
  ];

  if (discountAmount && discountAmount > 0) {
    rows.push({ label: 'Discount', value: `-${formatCurrency(discountAmount, currency)}` });
  }

  if (shippingAmount && shippingAmount > 0) {
    rows.push({ label: 'Shipping', value: formatCurrency(shippingAmount, currency) });
  }

  if (taxAmount > 0) {
    rows.push({ label: 'Tax (VAT)', value: formatCurrency(taxAmount, currency) });
  }

  rows.push({ label: 'Total', value: formatCurrency(grandTotal, currency), bold: true });

  return `
    <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
      <table style="width: 250px;">
        ${rows
          .map(
            (row) => `
          <tr>
            <td style="padding: 8px; text-align: left; font-size: 12px; ${row.bold ? 'font-weight: bold; font-size: 14px;' : ''}">${row.label}</td>
            <td style="padding: 8px; text-align: right; font-size: 12px; ${row.bold ? 'font-weight: bold; font-size: 14px; color: #111827;' : ''}">${row.value}</td>
          </tr>
        `,
          )
          .join('')}
      </table>
    </div>
  `;
}
