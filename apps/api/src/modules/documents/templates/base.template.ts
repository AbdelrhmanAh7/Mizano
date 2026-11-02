import { BRAND, BRAND_COLORS } from '@mizano/shared-types';
import type { DocumentDigits } from '../../../common/utils/document-digits';

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
    primary: BRAND_COLORS.primary,
    secondary: BRAND_COLORS.muted,
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
  /** Ledger currency; documents fall back to it, not to `currency` (a USD schema default). */
  baseCurrency?: string;
  /** Digits of Arabic documents (Organization.documentDigits); English ones always print latn. */
  documentDigits?: DocumentDigits;
}

/** Language of a generated document. Arabic renders right-to-left. */
export type DocumentLocale = 'en' | 'ar';

/**
 * The printed strings of one document type in one language: every label key, plus `status`
 * keyed by the schema enum. Typing both languages with it makes a missing translation a
 * compile error.
 */
export type DocumentCopy<K extends string> = Record<K, string> & {
  status: Record<string, string>;
};

export function documentDirection(locale: DocumentLocale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Intl locale for numbers and dates. English always uses Western digits; Arabic uses the
 * organization's choice through the Unicode `nu` extension (`ar-u-nu-latn` / `ar-u-nu-arab`).
 */
export function intlLocaleFor(locale: DocumentLocale, digits: DocumentDigits = 'latn'): string {
  if (locale !== 'ar') return 'en-SA';
  return digits === 'arab' ? 'ar-u-nu-arab' : 'ar-u-nu-latn';
}

/**
 * System fonts installed in the API image (apk font-noto-arabic, font-dejavu). The renderer has
 * no network, so web fonts cannot load; Chromium falls back glyph by glyph along this list, so
 * Arabic names on an English invoice render too.
 */
export function documentFontStack(locale: DocumentLocale): string {
  return locale === 'ar'
    ? "'Noto Sans Arabic', 'Noto Naskh Arabic', 'DejaVu Sans', Arial, sans-serif"
    : "'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', 'Noto Sans Arabic', sans-serif";
}

const BASE_LABELS: Record<DocumentLocale, Record<string, string>> = {
  en: {
    description: 'Description',
    qty: 'Qty',
    rate: 'Rate',
    taxPercent: 'Tax %',
    discountPercent: 'Disc. %',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    shipping: 'Shipping',
    tax: 'Tax (VAT)',
    total: 'Total',
    tel: 'Tel',
    email: 'Email',
    taxId: 'Tax ID',
    bankDetails: 'Bank Details',
    preparedWith: 'Prepared with',
  },
  ar: {
    description: 'الوصف',
    qty: 'الكمية',
    rate: 'السعر',
    taxPercent: 'الضريبة %',
    discountPercent: 'الخصم %',
    amount: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    shipping: 'الشحن',
    tax: 'ضريبة القيمة المضافة',
    total: 'الإجمالي',
    tel: 'هاتف',
    email: 'البريد الإلكتروني',
    taxId: 'الرقم الضريبي',
    bankDetails: 'البيانات البنكية',
    preparedWith: 'أُعدّ باستخدام',
  },
};

export interface DocumentLineItem {
  description: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxRate?: number;
  amount: number;
}

// ---------------------------------------------------------------------------
// HTML safety helpers
//
// Every value that is not a number/date formatter result and is interpolated into the
// HTML must go through `escapeHtml`. Colours and image sources land in attributes and
// CSS, where HTML escaping is not enough, so they use `safeColor` / `safeImageSrc`.
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escape text for use in HTML element content and quoted attribute values. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}

/** Accepts only hex colours (#RGB, #RGBA, #RRGGBB, #RRGGBBAA); anything else falls back. */
export function safeColor(value: string | undefined | null, fallback: string): string {
  return typeof value === 'string' &&
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
    ? value
    : fallback;
}

const SAFE_IMAGE_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Only inline `data:image/...;base64` sources are allowed. Remote URLs are refused: the PDF
 * renderer has no network access (SSRF protection), so they could never load anyway.
 */
export function safeImageSrc(url: string | undefined | null): string | undefined {
  return typeof url === 'string' && SAFE_IMAGE_DATA_URI.test(url) ? url : undefined;
}

/** `<img>` for the organization logo, or an empty string when there is no safe source. */
export function renderLogoHtml(org: OrganizationInfo, style: string): string {
  const src = safeImageSrc(org.logoUrl);
  return src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(org.name)}" style="${style}" />`
    : '';
}

/** A street line, a city and a country, as a document prints a party or the organization. */
export interface PostalAddress {
  address?: string;
  city?: string;
  country?: string;
}

/** The address columns of a customer or vendor row. */
interface PartyAddressColumns {
  address?: string | null;
  city?: string | null;
  country?: string | null;
  billingStreet?: string | null;
  billingCity?: string | null;
  billingCountry?: string | null;
}

/**
 * The address a document prints for a customer or vendor: the billing address the web forms and
 * the FlowLine API write, else the simple columns import/export writes. One source per address,
 * so a document never mixes the street of one with the city of the other.
 */
export function partyAddress(party: PartyAddressColumns): PostalAddress {
  const billing = [party.billingStreet, party.billingCity, party.billingCountry];
  const [address, city, country] = billing.some((v) => v?.trim())
    ? billing
    : [party.address, party.city, party.country];
  return { address: address || undefined, city: city || undefined, country: country || undefined };
}

/** Escaped street and "city, country" paragraphs; a city or a country alone still prints. */
export function renderAddressHtml(address: PostalAddress, style: string): string {
  const place = [address.city, address.country].filter(Boolean).map(escapeHtml).join(', ');
  return (
    (address.address ? `<p style="${style}">${escapeHtml(address.address)}</p>` : '') +
    (place ? `<p style="${style}">${place}</p>` : '')
  );
}

// Common formatting utilities (display boundary only: the amounts were computed in Decimal)
export function formatCurrency(
  amount: number | string,
  currency: string = 'SAR',
  locale: DocumentLocale = 'en',
  digits: DocumentDigits = 'latn',
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat(intlLocaleFor(locale, digits), {
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

/** A quantity in the document's digits, up to the 4 decimals the database keeps. */
export function formatQuantity(
  value: number,
  locale: DocumentLocale = 'en',
  digits: DocumentDigits = 'latn',
): string {
  return new Intl.NumberFormat(intlLocaleFor(locale, digits), {
    maximumFractionDigits: 4,
  }).format(value);
}

/** A rate given in percent (15 = 15%), with the document's digits and percent sign. */
export function formatPercent(
  value: number,
  locale: DocumentLocale = 'en',
  digits: DocumentDigits = 'latn',
): string {
  return new Intl.NumberFormat(intlLocaleFor(locale, digits), {
    style: 'percent',
    maximumFractionDigits: 4,
  }).format(value / 100);
}

// Generate header section for documents
export function generateHeaderHtml(
  org: OrganizationInfo,
  primaryColor?: string,
  locale: DocumentLocale = 'en',
): string {
  const color = safeColor(primaryColor || org.primaryColor, defaultTemplateConfig.colors.primary);
  const l = BASE_LABELS[locale];

  return `
    <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
      <div>
        ${renderLogoHtml(org, 'max-height: 60px; max-width: 200px;')}
        <h1 style="color: ${color}; margin: 10px 0 5px 0; font-size: 24px;">${escapeHtml(org.name)}</h1>
        ${renderAddressHtml(org, `margin: 2px 0; color: ${BRAND_COLORS.muted}; font-size: 12px;`)}
        ${org.phone ? `<p style="margin: 2px 0; color: ${BRAND_COLORS.muted}; font-size: 12px;">${l.tel}: <span dir="ltr">${escapeHtml(org.phone)}</span></p>` : ''}
        ${org.email ? `<p style="margin: 2px 0; color: ${BRAND_COLORS.muted}; font-size: 12px;">${l.email}: ${escapeHtml(org.email)}</p>` : ''}
        ${org.taxId ? `<p style="margin: 2px 0; color: ${BRAND_COLORS.muted}; font-size: 12px;">${l.taxId}: ${escapeHtml(org.taxId)}</p>` : ''}
      </div>
    </div>
  `;
}

/**
 * One small line naming the product at the foot of every PDF, with the logo tile drawn inline
 * (the renderer loads nothing from outside the page). The organization's own logo stays on top.
 */
export function brandFooterHtml(locale: DocumentLocale = 'en'): string {
  const mark =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="12" height="12" aria-hidden="true" style="vertical-align: -2px;">' +
    '<rect width="64" height="64" rx="15" fill="#0D9488"/>' +
    '<path d="M17 18H47M38 18V35A10 10 0 0 1 18 35" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="28" cy="33.5" r="4" fill="#EF9F27"/></svg>';
  return `<p style="margin-top: 12px; text-align: center; color: ${BRAND_COLORS.muted}; font-size: 9px;">${mark}&nbsp;${BASE_LABELS[locale].preparedWith} ${escapeHtml(BRAND.name[locale])}</p>`;
}

// Generate footer section for documents
export function generateFooterHtml(
  org: OrganizationInfo,
  primaryColor?: string,
  locale: DocumentLocale = 'en',
): string {
  const color = safeColor(primaryColor || org.primaryColor, defaultTemplateConfig.colors.primary);
  const l = BASE_LABELS[locale];

  return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid ${defaultTemplateConfig.colors.border};">
      ${
        org.bankDetails
          ? `
        <div style="margin-bottom: 15px;">
          <h4 style="color: ${color}; margin-bottom: 5px; font-size: 12px;">${l.bankDetails}</h4>
          <p style="white-space: pre-line; color: ${BRAND_COLORS.muted}; font-size: 11px;">${escapeHtml(org.bankDetails)}</p>
        </div>
      `
          : ''
      }
      ${
        org.footerText
          ? `
        <p style="text-align: center; color: ${BRAND_COLORS.muted}; font-size: 10px;">${escapeHtml(org.footerText)}</p>
      `
          : ''
      }
      ${brandFooterHtml(locale)}
    </div>
  `;
}

// Generate items table HTML
export function generateItemsTableHtml(
  items: DocumentLineItem[],
  currency: string = 'SAR',
  showTax: boolean = true,
  primaryColor?: string,
  locale: DocumentLocale = 'en',
  digits: DocumentDigits = 'latn',
): string {
  const color = safeColor(primaryColor, defaultTemplateConfig.colors.primary);
  const l = BASE_LABELS[locale];
  const money = (value: number) => formatCurrency(value, currency, locale, digits);
  const percent = (value: number | undefined) => formatPercent(value || 0, locale, digits);

  // A line discount (percent) changes the line amount, so it must be printed whenever one exists;
  // otherwise "3 × 49.99 = 134.97" cannot be reconciled on paper.
  const showDiscount = items.some((item) => (item.discount ?? 0) > 0);
  const headers = [
    l.description,
    l.qty,
    l.rate,
    ...(showDiscount ? [l.discountPercent] : []),
    ...(showTax ? [l.taxPercent] : []),
    l.amount,
  ];

  const headerCells = headers
    .map(
      (h, i) =>
        `<th style="padding: 10px; text-align: ${i === 0 ? 'start' : 'end'}; background: ${color}; color: white; font-size: 12px;">${h}</th>`,
    )
    .join('');

  const rows = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid ${defaultTemplateConfig.colors.border};">
        <td style="padding: 10px; text-align: start; font-size: 12px;"><bdi>${escapeHtml(item.description)}</bdi></td>
        <td style="padding: 10px; text-align: end; font-size: 12px;">${escapeHtml(formatQuantity(item.quantity, locale, digits))}</td>
        <td style="padding: 10px; text-align: end; font-size: 12px;">${money(item.rate)}</td>
        ${showDiscount ? `<td style="padding: 10px; text-align: end; font-size: 12px;">${escapeHtml(percent(item.discount))}</td>` : ''}
        ${showTax ? `<td style="padding: 10px; text-align: end; font-size: 12px;">${escapeHtml(percent(item.taxRate))}</td>` : ''}
        <td style="padding: 10px; text-align: end; font-size: 12px; font-weight: bold;">${money(item.amount)}</td>
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
  locale: DocumentLocale = 'en',
  digits: DocumentDigits = 'latn',
): string {
  const l = BASE_LABELS[locale];
  const money = (value: number) => formatCurrency(value, currency, locale, digits);
  const rows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: l.subtotal, value: money(subtotal) },
  ];

  if (discountAmount && discountAmount > 0) {
    rows.push({ label: l.discount, value: `-${money(discountAmount)}` });
  }

  if (shippingAmount && shippingAmount > 0) {
    rows.push({ label: l.shipping, value: money(shippingAmount) });
  }

  if (taxAmount > 0) {
    rows.push({ label: l.tax, value: money(taxAmount) });
  }

  rows.push({ label: l.total, value: money(grandTotal), bold: true });

  return `
    <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
      <table style="width: 250px;">
        ${rows
          .map(
            (row) => `
          <tr>
            <td style="padding: 8px; text-align: start; font-size: 12px; ${row.bold ? 'font-weight: bold; font-size: 14px;' : ''}">${escapeHtml(row.label)}</td>
            <td style="padding: 8px; text-align: end; font-size: 12px; ${row.bold ? 'font-weight: bold; font-size: 14px; color: #111827;' : ''}">${escapeHtml(row.value)}</td>
          </tr>
        `,
          )
          .join('')}
      </table>
    </div>
  `;
}
