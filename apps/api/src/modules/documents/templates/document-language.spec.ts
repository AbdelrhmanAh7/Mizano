import { generateBillHtml, BillData } from './bill.template';
import { generateInvoiceHtml, InvoiceData } from './invoice.template';
import { generateQuoteHtml, QuoteData } from './quote.template';
import { intlLocaleFor, type DocumentLocale, type OrganizationInfo } from './base.template';
import type { DocumentDigits } from '../../../common/utils/document-digits';

/** Item 3: quote and bill PDFs in Arabic like invoices, with the organization's digit choice. */

const ARABIC_INDIC = /[٠-٩]/;
const line = { description: 'استشارات', quantity: 3, rate: 1000, taxRate: 14, amount: 3000 };
const party = { name: 'شركة النيل', taxId: '300-123', address: 'شارع التحرير', city: 'القاهرة' };

const quote: QuoteData = {
  quoteNumber: 'QT-0007',
  date: '2026-10-31',
  expiryDate: '2026-11-30',
  status: 'SENT',
  customer: party,
  lines: [line],
  subtotal: 3000,
  taxAmount: 420,
  grandTotal: 3420,
  currency: 'EGP',
  notes: 'شكرًا',
  terms: 'الدفع خلال شهر',
};

const bill: BillData = {
  billNumber: 'BILL-0009',
  date: '2026-10-31',
  dueDate: '2026-11-30',
  status: 'PARTIALLY_PAID',
  vendor: party,
  lines: [line],
  subtotal: 3000,
  taxAmount: 420,
  grandTotal: 3420,
  balanceDue: 1420,
  currency: 'EGP',
  notes: 'تسليم المخزن',
};

const invoice: InvoiceData = {
  invoiceNumber: 'INV-0001',
  date: '2026-10-31',
  dueDate: '2026-11-30',
  status: 'SENT',
  customer: party,
  lines: [line],
  subtotal: 3000,
  taxAmount: 420,
  grandTotal: 3420,
  balanceDue: 3420,
  currency: 'EGP',
};

const org = (documentDigits?: DocumentDigits): OrganizationInfo => ({
  name: 'ميزان',
  phone: '+20 2 1234 5678',
  documentDigits,
});

/** The visible text: markup, styles and the document number (an identifier) aside. */
const visibleText = (html: string, ...identifiers: string[]): string =>
  identifiers.reduce(
    (text, id) => text.split(id).join(''),
    html
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\+20 2 1234 5678/g, ''),
  );

const render = {
  quote: (locale: DocumentLocale, digits?: DocumentDigits) =>
    generateQuoteHtml(org(digits), quote, locale),
  bill: (locale: DocumentLocale, digits?: DocumentDigits) =>
    generateBillHtml(org(digits), bill, locale),
  invoice: (locale: DocumentLocale, digits?: DocumentDigits) =>
    generateInvoiceHtml(org(digits), invoice, locale),
};
const NUMBERS = {
  quote: ['QT-0007', '300-123'],
  bill: ['BILL-0009', '300-123'],
  invoice: ['INV-0001', '300-123'],
};

describe('Arabic quote PDF', () => {
  it('renders right-to-left with the Arabic font and plain Arabic labels', () => {
    const html = render.quote('ar');
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("'Noto Sans Arabic'");
    for (const label of [
      'عرض سعر',
      'مقدَّم إلى',
      'تاريخ العرض:',
      'صالح حتى:',
      'الوصف',
      'الكمية',
      'المجموع الفرعي',
      'الإجمالي',
      'ملاحظات',
      'الشروط والأحكام',
      'الموافقة',
      'التوقيع',
      'الرقم الضريبي',
      'مرسل',
    ]) {
      expect(html).toContain(label);
    }
    for (const english of ['QUOTATION', 'Prepared For', 'Valid Until', 'Signature', '>SENT<']) {
      expect(html).not.toContain(english);
    }
  });

  it('prints Arabic-Indic digits when the organization chose them', () => {
    const html = render.quote('ar', 'arab');
    const money = new Intl.NumberFormat('ar-u-nu-arab', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 2,
    }).format(3420);
    expect(html).toContain(money);
    expect(html).toContain('٣١ أكتوبر ٢٠٢٦');
    expect(html).toContain('>٣</td>'); // quantity
    expect(html).not.toMatch(/3,420\.00|>3<\/td>|2026/);
  });

  it('prints Western digits by default', () => {
    const html = render.quote('ar');
    expect(html).toContain('3,420.00');
    expect(html).toContain('31 أكتوبر 2026');
    expect(visibleText(html, ...NUMBERS.quote)).not.toMatch(ARABIC_INDIC);
  });
});

describe('Arabic bill PDF', () => {
  it('renders right-to-left with plain Arabic labels for the vendor, dates and totals', () => {
    const html = render.bill('ar');
    expect(html).toContain('<html lang="ar" dir="rtl">');
    for (const label of [
      'فاتورة مورد',
      'من (المورد)',
      'تاريخ الفاتورة:',
      'تاريخ الاستحقاق:',
      'الرصيد المستحق:',
      'ضريبة القيمة المضافة',
      'ملاحظات',
      'مدفوعة جزئيًا',
    ]) {
      expect(html).toContain(label);
    }
    for (const english of ['>BILL<', 'From (Vendor)', 'Balance Due', 'PARTIALLY_PAID']) {
      expect(html).not.toContain(english);
    }
  });

  it('prints Arabic-Indic digits when set and Western ones otherwise', () => {
    expect(render.bill('ar', 'arab')).toContain('١٬٤٢٠٫٠٠');
    const percent = (locale: string) =>
      new Intl.NumberFormat(locale, { style: 'percent' }).format(0.14);
    expect(render.bill('ar', 'arab')).toContain(percent('ar-u-nu-arab')); // ١٤٪
    expect(render.bill('ar', 'latn')).toContain('1,420.00');
    expect(render.bill('ar', 'latn')).toContain(percent('ar-u-nu-latn')); // 14% (with marks)
  });
});

describe('document digits', () => {
  it.each(['quote', 'bill', 'invoice'] as const)(
    'an English %s always prints Western digits, whatever the setting',
    (kind) => {
      const html = render[kind]('en', 'arab');
      expect(html).toContain('<html lang="en" dir="ltr">');
      expect(html).toContain('3,420.00');
      expect(visibleText(html, ...NUMBERS[kind])).not.toMatch(ARABIC_INDIC);
    },
  );

  it('applies the setting to Arabic invoices too', () => {
    expect(render.invoice('ar', 'arab')).toContain('٣٬٤٢٠٫٠٠');
    expect(render.invoice('ar', 'latn')).toContain('3,420.00');
  });

  it('keeps identifiers as typed', () => {
    const html = render.bill('ar', 'arab');
    expect(html).toContain('BILL-0009');
    expect(html).toContain('300-123');
  });

  it('maps the language and digits to an Intl locale with the nu extension', () => {
    expect(intlLocaleFor('ar', 'arab')).toBe('ar-u-nu-arab');
    expect(intlLocaleFor('ar', 'latn')).toBe('ar-u-nu-latn');
    expect(intlLocaleFor('ar')).toBe('ar-u-nu-latn');
    expect(intlLocaleFor('en', 'arab')).toBe('en-SA');
  });
});
