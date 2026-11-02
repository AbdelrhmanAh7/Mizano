import { BRAND_COLORS } from '@mizano/shared-types';
import {
  OrganizationInfo,
  escapeHtml,
  generateFooterHtml,
  generateHeaderHtml,
  generateItemsTableHtml,
  generateTotalsHtml,
  renderLogoHtml,
  safeColor,
  safeImageSrc,
} from './base.template';
import { generateInvoiceHtml, InvoiceData } from './invoice.template';
import { generateBillHtml, BillData } from './bill.template';
import { generateQuoteHtml, QuoteData } from './quote.template';
import { generatePayslipHtml, PayslipData } from './payslip.template';

/** Markers that, if they appear unescaped, mean user data became markup. */
const XSS = '<script>alert(1)</script>';
const ATTR = '"><img src=x onerror=alert(2)>';
const STYLE = 'red;} body{background:url(http://evil.example/x)}';

function expectNoInjectedMarkup(html: string): void {
  expect(html).not.toContain('<script>alert');
  expect(html).not.toContain('</script>');
  expect(html).not.toMatch(/<img[^>]*onerror/i);
  expect(html).not.toContain('"><img');
  expect(html).not.toContain('http://evil.example');
  // …but the text is still shown, escaped
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
}

const hostileOrg: OrganizationInfo = {
  name: `Org ${XSS}`,
  logoUrl: 'http://evil.example/logo.png',
  address: `Addr ${XSS}`,
  city: `City ${XSS}`,
  country: `Country ${XSS}`,
  phone: `Phone ${ATTR}`,
  email: `mail${ATTR}`,
  taxId: `Tax ${ATTR}`,
  bankDetails: `Bank ${XSS}`,
  footerText: `Footer ${XSS}`,
  primaryColor: STYLE,
  currency: 'SAR',
};

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters and backticks', () => {
    expect(escapeHtml('<a href="x" title=\'y\'>&`')).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&#96;',
    );
  });

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('renders null/undefined as empty and numbers as text', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(14.5)).toBe('14.5');
  });

  it('leaves Arabic and other text untouched', () => {
    expect(escapeHtml('شركة الأمل للتجارة')).toBe('شركة الأمل للتجارة');
  });
});

describe('safeColor / safeImageSrc', () => {
  it('accepts only hex colours', () => {
    expect(safeColor('#3B82F6', '#000')).toBe('#3B82F6');
    expect(safeColor('#fff', '#000')).toBe('#fff');
    expect(safeColor(STYLE, '#000')).toBe('#000');
    expect(safeColor('red', '#000')).toBe('#000');
    expect(safeColor('url(http://evil.example)', '#000')).toBe('#000');
    expect(safeColor(undefined, '#123456')).toBe('#123456');
  });

  it('accepts only inline base64 images, never remote or file URLs', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(safeImageSrc(png)).toBe(png);
    expect(safeImageSrc('http://169.254.169.254/x.png')).toBeUndefined();
    expect(safeImageSrc('https://evil.example/logo.png')).toBeUndefined();
    expect(safeImageSrc('file:///etc/passwd')).toBeUndefined();
    expect(safeImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
    expect(safeImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined();
    expect(safeImageSrc('data:image/png;base64,AAAA" onerror="x')).toBeUndefined();
  });

  it('renders no <img> for an unsafe logo and an escaped one for a safe logo', () => {
    expect(renderLogoHtml({ name: 'X', logoUrl: 'http://evil.example/l.png' }, 's')).toBe('');
    const html = renderLogoHtml(
      { name: `A"B`, logoUrl: 'data:image/png;base64,AAAA' },
      'max-height: 60px;',
    );
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('alt="A&quot;B"');
  });
});

describe('shared building blocks', () => {
  it('header and footer escape every organization field', () => {
    const html = generateHeaderHtml(hostileOrg) + generateFooterHtml(hostileOrg);
    expectNoInjectedMarkup(html);
    expect(html).not.toContain('<img'); // remote logo refused
  });

  it('items table and totals escape descriptions, labels and colours', () => {
    const html =
      generateItemsTableHtml(
        [{ description: XSS, quantity: 1, rate: 10, taxRate: 14, amount: 11.4 }],
        'SAR',
        true,
        STYLE,
      ) + generateTotalsHtml(10, 1.4, 11.4, 'SAR');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('evil.example');
  });
});

describe('document templates escape all interpolated data', () => {
  const customer = {
    name: `Cust ${XSS}`,
    email: `c${ATTR}`,
    phone: `p${ATTR}`,
    address: `a ${XSS}`,
    city: `city ${XSS}`,
    country: `country ${XSS}`,
    taxId: `tax ${ATTR}`,
  };
  const lines = [{ description: `Line ${XSS}`, quantity: 2, rate: 5, amount: 10 }];

  it('invoice', () => {
    const data: InvoiceData = {
      invoiceNumber: `INV ${XSS}`,
      date: new Date('2026-09-01'),
      dueDate: new Date('2026-10-01'),
      status: `PAID ${XSS}`,
      customer,
      lines,
      subtotal: 10,
      taxAmount: 0,
      grandTotal: 10,
      balanceDue: 0,
      currency: 'SAR',
      notes: `Notes ${XSS}`,
      terms: `Terms ${XSS}`,
      reference: `PO ${XSS}`,
    };
    const html = generateInvoiceHtml(hostileOrg, data);
    expectNoInjectedMarkup(html);
    // Audit B9: the customer's reference is printed (escaped) under the dates.
    expect(html).toContain('Reference:');
    expect(html).toContain('PO &lt;script&gt;');
    expect(generateInvoiceHtml(hostileOrg, { ...data, reference: 'PO-77' }, 'ar')).toContain(
      'المرجع:',
    );
  });

  it('bill', () => {
    const data: BillData = {
      billNumber: `BILL ${XSS}`,
      date: new Date('2026-09-01'),
      dueDate: new Date('2026-10-01'),
      status: `OPEN ${XSS}`,
      vendor: customer,
      lines,
      subtotal: 10,
      taxAmount: 0,
      grandTotal: 10,
      balanceDue: 10,
      currency: 'SAR',
      notes: `Notes ${XSS}`,
    };
    expectNoInjectedMarkup(generateBillHtml(hostileOrg, data));
  });

  it('quote', () => {
    const data: QuoteData = {
      quoteNumber: `Q ${XSS}`,
      date: new Date('2026-09-01'),
      expiryDate: new Date('2026-10-01'),
      status: `SENT ${XSS}`,
      customer,
      lines,
      subtotal: 10,
      taxAmount: 0,
      grandTotal: 10,
      currency: 'SAR',
      notes: `Notes ${XSS}`,
      terms: `Terms ${XSS}`,
    };
    expectNoInjectedMarkup(generateQuoteHtml(hostileOrg, data));
  });

  it('payslip', () => {
    const data: PayslipData = {
      payslipNumber: `PS ${XSS}`,
      payPeriodStart: new Date('2026-09-01'),
      payPeriodEnd: new Date('2026-09-30'),
      payDate: new Date('2026-09-28'),
      employee: {
        name: `Emp ${XSS}`,
        employeeId: `E ${XSS}`,
        department: `Dept ${XSS}`,
        position: `Pos ${XSS}`,
        email: `e${ATTR}`,
        bankAccount: `IBAN ${XSS}`,
      },
      earnings: [{ description: `Basic ${XSS}`, amount: 100, isGross: true }],
      deductions: [{ description: `Tax ${XSS}`, amount: 10 }],
      grossPay: 100,
      totalDeductions: 10,
      netPay: 90,
      currency: 'SAR',
    };
    expectNoInjectedMarkup(generatePayslipHtml(hostileOrg, data));
  });

  it('never lets a hostile colour reach a style attribute', () => {
    const html = generateInvoiceHtml(hostileOrg, {
      invoiceNumber: 'INV-1',
      date: new Date('2026-09-01'),
      dueDate: new Date('2026-10-01'),
      status: 'DRAFT',
      customer: { name: 'Acme' },
      lines,
      subtotal: 10,
      taxAmount: 0,
      grandTotal: 10,
      balanceDue: 0,
      currency: 'SAR',
    });
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('background:url(');
    expect(html).toContain(BRAND_COLORS.primary); // fell back to the default brand colour
  });
});

describe('printed document contrast', () => {
  const data = {
    date: '2026-09-01',
    dueDate: '2026-10-01',
    expiryDate: '2026-10-01',
    customer: { name: 'QA Customer' },
    vendor: { name: 'QA Vendor' },
    invoiceNumber: 'INV-1',
    billNumber: 'BILL-1',
    quoteNumber: 'Q-1',
    lines: [],
    subtotal: 0,
    taxAmount: 0,
    grandTotal: 0,
    balanceDue: 0,
    currency: 'EGP',
  };
  const documents = [
    {
      name: 'invoice',
      render: (status: string) => generateInvoiceHtml(hostileOrg, { ...data, status }),
      statuses: ['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'VOID', 'UNKNOWN'],
    },
    {
      name: 'bill',
      render: (status: string) => generateBillHtml(hostileOrg, { ...data, status }),
      statuses: [
        'DRAFT',
        'PENDING',
        'OPEN',
        'PAID',
        'PARTIALLY_PAID',
        'OVERDUE',
        'VOID',
        'UNKNOWN',
      ],
    },
    {
      name: 'quote',
      render: (status: string) => generateQuoteHtml(hostileOrg, { ...data, status }),
      statuses: ['DRAFT', 'SENT', 'ACCEPTED', 'INVOICED', 'DECLINED', 'EXPIRED', 'UNKNOWN'],
    },
  ];
  it.each(documents)(
    '$name badges keep white text readable for every status',
    ({ render, statuses }) => {
      for (const status of statuses) {
        const html = render(status);
        const color = /background: (#[\da-f]{6}); color: white; padding: 8px 16px/i.exec(html)?.[1];
        expect(color).toBeDefined();
        const channels = [1, 3, 5].map((i) => parseInt(color!.slice(i, i + 2), 16) / 255);
        const linear = channels.map((v) =>
          v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
        );
        const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
        expect(html).not.toMatch(/color:\s*#9ca3af/i);
      }
    },
  );
});
