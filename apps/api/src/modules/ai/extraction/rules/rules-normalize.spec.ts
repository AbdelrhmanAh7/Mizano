import { normalizeDigits } from './rules-normalize';
import { parseAmount, findAmounts } from './rules-amounts';
import { parseDate } from './rules-dates';
import { extractInvoiceFields } from './invoice-rules-extractor';

describe('@issue-109 normalizeDigits: Arabic-Indic and Persian digit normalization', () => {
  // AC1: Arabic-Indic digits and separators parse correctly
  it('maps Arabic-Indic decimal and thousands separators to ASCII', () => {
    expect(normalizeDigits('١٢٣٫٤٥')).toBe('123.45');
    expect(normalizeDigits('١٬٢٣٤٫٥٠')).toBe('1,234.50');
  });

  it('maps Persian digits and separators to ASCII', () => {
    expect(normalizeDigits('۱۲۳٫۴۵')).toBe('123.45');
    expect(normalizeDigits('۱٬۲۳۴٫۵۰')).toBe('1,234.50');
  });

  // AC2: Arabic-Indic dates parse correctly
  it('normalizes Arabic-Indic digits in dates', () => {
    expect(normalizeDigits('٠٧/١٠/٢٠٢٦')).toBe('07/10/2026');
    expect(normalizeDigits('۰۷/۱۰/۲۰۲۶')).toBe('07/10/2026');
  });

  // AC3: Mixed-script strings parse correctly
  it('normalizes mixed-script currency amounts', () => {
    expect(normalizeDigits('EGP ١٢٠٠')).toBe('EGP 1200');
    expect(normalizeDigits('SAR ١٬٢٣٤٫٥٠')).toBe('SAR 1,234.50');
    expect(normalizeDigits('USD ۱۲۳٫۴۵')).toBe('USD 123.45');
  });

  // AC4: Existing English-only behavior unchanged
  it('leaves ASCII digits and separators unchanged', () => {
    expect(normalizeDigits('123.45')).toBe('123.45');
    expect(normalizeDigits('1,234.50')).toBe('1,234.50');
    expect(normalizeDigits('07/10/2026')).toBe('07/10/2026');
    expect(normalizeDigits('EGP 1200')).toBe('EGP 1200');
  });

  it('removes bidi control marks and diacritics', () => {
    expect(normalizeDigits('1\u200e2\u200f3')).toBe('123');
    expect(normalizeDigits('١\u064b٢\u064c٣')).toBe('123');
  });
});

describe('@issue-109 parseAmount: decimal-safe parsing with normalized input', () => {
  // AC1: amounts parse to correct decimal values
  it('parses Arabic-Indic normalized amounts to correct Decimal', () => {
    expect(parseAmount('123.45')?.toString()).toBe('123.45');
    expect(parseAmount('1,234.50')?.toString()).toBe('1234.5'); // Decimal.js drops trailing zeros
  });

  it('parses Arabic thousands/decimal separator style', () => {
    expect(parseAmount('1.234,50')?.toString()).toBe('1234.5');
  });

  // AC5: amounts remain decimal-safe (no float math)
  it('uses Decimal.js for precise arithmetic', () => {
    const result = parseAmount('123.4567');
    expect(result).not.toBeNull();
    expect(result!.toString()).toBe('123.4567');
    // Verify it's a Decimal instance
    expect(result!.constructor.name).toBe('Decimal');
  });

  it('rejects values beyond Decimal(19,4) bounds', () => {
    expect(parseAmount('12345678901234567')).toBeNull(); // > 15 integer digits
    expect(parseAmount('1.12345')).toBeNull(); // > 4 decimal places
  });
});

describe('@issue-109 findAmounts: extracts amounts from normalized lines', () => {
  // AC3: mixed-script strings
  it('extracts amounts from mixed-script lines after normalization', () => {
    const line = 'Total: EGP ١٬٢٣٤٫٥٠';
    const normalized = normalizeDigits(line);
    const amounts = findAmounts(normalized);
    expect(amounts.map((a) => a.value.toString())).toEqual(['1234.5']);
  });

  it('extracts amounts from Arabic-Indic digit lines', () => {
    const line = 'الإجمالي: ١٬١٤٠٫٠٠ ج.م';
    const normalized = normalizeDigits(line);
    const amounts = findAmounts(normalized);
    expect(amounts.map((a) => a.value.toString())).toEqual(['1140']);
  });

  it('extracts amounts from Persian digit lines', () => {
    const line = 'مجموع: ۱٬۲۳۴٫۵۰ ر.س';
    const normalized = normalizeDigits(line);
    const amounts = findAmounts(normalized);
    expect(amounts.map((a) => a.value.toString())).toEqual(['1234.5']);
  });

  // AC4: English-only still works
  it('extracts amounts from English lines unchanged', () => {
    const line = 'Total: EGP 1,234.50';
    const amounts = findAmounts(line);
    expect(amounts.map((a) => a.value.toString())).toEqual(['1234.5']);
  });
});

describe('@issue-109 parseDate: parses normalized Arabic-Indic dates', () => {
  // AC2: dates parse correctly
  it('parses Arabic-Indic day/month/year dates', () => {
    const normalized = normalizeDigits('٠٧/١٠/٢٠٢٦');
    const result = parseDate(normalized);
    expect(result).toEqual({ iso: '2026-10-07', ambiguous: true }); // day-first, both <= 12
  });

  it('parses Persian day/month/year dates', () => {
    const normalized = normalizeDigits('۰۷/۱۰/۲۰۲۶');
    const result = parseDate(normalized);
    expect(result).toEqual({ iso: '2026-10-07', ambiguous: true });
  });

  it('parses Arabic-Indic year-first dates unambiguously', () => {
    const normalized = normalizeDigits('٢٠٢٦/١٠/٠٧');
    const result = parseDate(normalized);
    expect(result).toEqual({ iso: '2026-10-07', ambiguous: false });
  });

  it('parses mixed separator styles', () => {
    expect(parseDate(normalizeDigits('٠٧-١٠-٢٠٢٦'))).toEqual({
      iso: '2026-10-07',
      ambiguous: true,
    });
    expect(parseDate(normalizeDigits('٠٧.١٠.٢٠٢٦'))).toEqual({
      iso: '2026-10-07',
      ambiguous: true,
    });
  });

  // AC4: English dates unchanged
  it('parses English dates unchanged', () => {
    expect(parseDate('07/10/2026')).toEqual({ iso: '2026-10-07', ambiguous: true });
    expect(parseDate('2026-10-07')).toEqual({ iso: '2026-10-07', ambiguous: false });
  });
});

describe('@issue-109 extractInvoiceFields: full extraction with Arabic-Indic digits', () => {
  // AC1-3: full invoice extraction with Arabic-Indic digits
  it('extracts all fields from Arabic invoice with Arabic-Indic digits', () => {
    const arabicInvoice = `
شركة النيل للتوريدات
فاتورة ضريبية
رقم الفاتورة: INV-٢٠٢٤-٠١٥٠
التاريخ: ١٥/٠٣/٢٠٢٤
تاريخ الاستحقاق: ١٤/٠٤/٢٠٢٤
الرقم الضريبي: ١٢٣-٤٥٦-٧٨٩
البيان         الكمية    السعر    الإجمالي
ورق طباعة      ١٠       ٥٠٫٠٠     ٥٠٠٫٠٠
المجموع قبل الضريبة: ١٬٠٠٠٫٠٠ ج.م
ضريبة القيمة المضافة ١٤٪: ١٤٠٫٠٠ ج.م
الإجمالي: ١٬١٤٠٫٠٠ ج.م
    `.trim();

    const result = extractInvoiceFields(arabicInvoice);
    expect(result.invoiceNumber?.value).toBe('INV-2024-0150');
    expect(result.date?.value).toBe('2024-03-15');
    expect(result.dueDate?.value).toBe('2024-04-14');
    expect(result.vendorTaxId).toMatchObject({ value: '123456789', country: 'EG' });
    expect(result.subtotal?.value.toString()).toBe('1000');
    expect(result.tax?.value.toString()).toBe('140');
    expect(result.total?.value.toString()).toBe('1140');
    expect(result.currency?.value).toBe('EGP');
  });

  it('extracts all fields from Arabic invoice with Persian digits', () => {
    const persianInvoice = `
شركة الاختبار
فاتورة ضريبية
رقم الفاتورة: INV-۲۰۲۴-۰۱۵۰
التاريخ: ۱۵/۰۳/۲۰۲۴
تاريخ الاستحقاق: ۱۴/۰۴/۲۰۲۴
الرقم الضريبي: ۱۲۳-۴۵۶-۷۸۹
المجموع قبل الضريبة: ۱٬۰۰۰٫۰۰ ج.م
ضريبة القيمة المضافة ۱۴٪: ۱۴۰٫۰۰ ج.م
الإجمالي: ۱٬۱۴۰٫۰۰ ج.م
    `.trim();

    const result = extractInvoiceFields(persianInvoice);
    expect(result.invoiceNumber?.value).toBe('INV-2024-0150');
    expect(result.date?.value).toBe('2024-03-15');
    expect(result.dueDate?.value).toBe('2024-04-14');
    expect(result.vendorTaxId).toMatchObject({ value: '123456789', country: 'EG' });
    expect(result.subtotal?.value.toString()).toBe('1000');
    expect(result.tax?.value.toString()).toBe('140');
    expect(result.total?.value.toString()).toBe('1140');
    expect(result.currency?.value).toBe('EGP');
  });

  it('extracts mixed-script currency lines', () => {
    const mixedInvoice = `
Test Vendor
Invoice
Invoice No: INV-001
Date: 2024-03-15
Total: EGP ١٬٢٣٤٫٥٠
    `.trim();

    const result = extractInvoiceFields(mixedInvoice);
    expect(result.total?.value.toString()).toBe('1234.5');
    expect(result.currency?.value).toBe('EGP');
  });

  // AC4: English invoices still work
  it('extracts English invoice unchanged', () => {
    const englishInvoice = `
Test Company
Tax Invoice
Invoice No: INV-2024-001
Date: 2024-03-15
Due Date: 2024-04-14
Subtotal: 1,000.00
VAT 14%: 140.00
Total: 1,140.00 EGP
    `.trim();

    const result = extractInvoiceFields(englishInvoice);
    expect(result.invoiceNumber?.value).toBe('INV-2024-001');
    expect(result.date?.value).toBe('2024-03-15');
    expect(result.dueDate?.value).toBe('2024-04-14');
    expect(result.subtotal?.value.toString()).toBe('1000');
    expect(result.tax?.value.toString()).toBe('140');
    expect(result.total?.value.toString()).toBe('1140');
    expect(result.currency?.value).toBe('EGP');
  });
});
