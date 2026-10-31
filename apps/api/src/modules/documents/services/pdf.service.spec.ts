import { PrismaService } from '../../../prisma/prisma.service';
import { PdfService } from './pdf.service';
import { renderHtmlToPdf } from './pdf-renderer';

jest.mock('./pdf-renderer', () => ({
  renderHtmlToPdf: jest.fn(async () => Buffer.from('%PDF')),
}));

const XSS = '<script>alert(1)</script>';
const ATTR = '"><img src=x onerror=alert(2)>';

const ORG_ROW = {
  id: 'org-1',
  name: `Org ${XSS}`,
  logoUrl: 'http://169.254.169.254/latest/meta-data/logo.png',
  companyAddress: `Addr ${XSS}`,
  city: 'Cairo',
  country: 'Egypt',
  phone: null,
  email: null,
  website: null,
  taxId: null,
  bankDetails: null,
  footerText: `Footer ${XSS}`,
  primaryColor: 'red;} body{background:url(http://evil.example/x)}',
  currency: 'EGP',
};

function expectSafeHtml(html: string): void {
  expect(html).not.toContain('<script>');
  expect(html).not.toMatch(/<img[^>]*onerror/i);
  expect(html).not.toContain('"><img');
  expect(html).not.toContain('evil.example');
  expect(html).not.toContain('169.254.169.254'); // remote logo refused
  expect(html).toContain('&lt;script&gt;');
}

describe('PdfService HTML safety', () => {
  let prisma: Record<string, Record<string, jest.Mock>>;
  let service: PdfService;
  const renderer = renderHtmlToPdf as jest.Mock;

  const lastHtml = (): string => String(renderer.mock.calls.at(-1)?.[0]);

  beforeEach(() => {
    renderer.mockClear();
    prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(ORG_ROW) },
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          name: `Cust ${XSS}`,
          email: `e${ATTR}`,
          address: `Addr ${XSS}`,
          city: `City ${XSS}`,
          country: `Country ${XSS}`,
        }),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { grandTotal: null } }),
      },
      paymentReceived: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      bill: { findMany: jest.fn().mockResolvedValue([]) },
      journalLine: { findMany: jest.fn().mockResolvedValue([]) },
      payslip: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new PdfService(prisma as unknown as PrismaService);
  });

  it('renders every PDF through the sandboxed renderer', async () => {
    const pdf = await service.generateStatementPdf(
      'org-1',
      'c1',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(pdf.toString()).toBe('%PDF');
  });

  it('statement of account escapes organization and customer fields', async () => {
    await service.generateStatementPdf(
      'org-1',
      'c1',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );
    expectSafeHtml(lastHtml());
  });

  it('statement escapes transaction references', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        date: new Date('2026-09-02'),
        invoiceNumber: `INV-${XSS}`,
        grandTotal: { toString: () => '100' },
      },
    ]);
    await service.generateStatementPdf(
      'org-1',
      'c1',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );
    expectSafeHtml(lastHtml());
    expect(lastHtml()).toContain('Invoice INV-&lt;script&gt;');
  });

  it('profit & loss and balance sheet escape account names and codes', async () => {
    const line = (type: string) => ({
      debit: { toString: () => '0' },
      credit: { toString: () => '50' },
      account: { name: `Acct ${XSS}`, type, subType: null, code: `1${ATTR}` },
    });
    prisma.journalLine.findMany.mockResolvedValue([
      line('REVENUE'),
      line('EXPENSE'),
      line('ASSET'),
      line('LIABILITY'),
      line('EQUITY'),
    ]);

    await service.generateProfitAndLossPdf('org-1', '2026-01-01', '2026-12-31');
    expectSafeHtml(lastHtml());

    await service.generateBalanceSheetPdf('org-1', '2026-12-31');
    expectSafeHtml(lastHtml());
  });

  it('aging reports escape customer and vendor names', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        customer: { name: `Cust ${XSS}` },
        balanceDue: { toString: () => '10' },
        dueDate: new Date('2026-01-01'),
      },
    ]);
    prisma.bill.findMany.mockResolvedValue([
      {
        vendor: { name: `Vend ${XSS}` },
        balanceDue: { toString: () => '10' },
        dueDate: new Date('2026-01-01'),
      },
    ]);

    await service.generateAgingReportPdf('org-1', 'receivables', '2026-06-01');
    expectSafeHtml(lastHtml());

    await service.generateAgingReportPdf('org-1', 'payables', '2026-06-01');
    expectSafeHtml(lastHtml());
  });

  it('payslip PDF generator includes employee jobTitle when position is not set', async () => {
    prisma.payslip.findFirst.mockResolvedValue({
      id: 'payslip-123',
      baseSalary: '4500.00',
      grossSalary: '4500.00',
      grossPay: null,
      totalDeductions: '0.00',
      netSalary: '4500.00',
      netPay: null,
      employee: {
        name: `Emp ${XSS}`,
        employeeId: 'EMP-99',
        employeeNumber: null,
        department: 'Operations',
        jobTitle: `Logistics Lead ${XSS}`,
        position: null,
        email: 'emp@mizano.com',
        bankAccount: 'EG1234567890',
      },
      payrollRun: {
        month: 10,
        year: 2026,
        periodStart: new Date('2026-10-01'),
        periodEnd: new Date('2026-10-31'),
        payDate: new Date('2026-10-28'),
      },
    });

    const pdf = await service.generatePayslipPdf('org-1', 'payslip-123');
    expect(pdf.toString()).toBe('%PDF');
    expect(lastHtml()).toContain('Logistics Lead &lt;script&gt;');
    expectSafeHtml(lastHtml());
  });

  it('payslip PDF generator prefers position over jobTitle when both are set', async () => {
    prisma.payslip.findFirst.mockResolvedValue({
      id: 'payslip-456',
      baseSalary: '6000.00',
      grossSalary: '6000.00',
      grossPay: null,
      totalDeductions: '0.00',
      netSalary: '6000.00',
      netPay: null,
      employee: {
        name: 'Sarah Connor',
        employeeId: 'EMP-100',
        employeeNumber: 'E100',
        department: 'Security',
        jobTitle: 'Field Agent',
        position: 'Head of Security',
        email: null,
        bankAccount: null,
      },
      payrollRun: {
        month: 10,
        year: 2026,
        periodStart: null,
        periodEnd: null,
        payDate: null,
      },
    });

    await service.generatePayslipPdf('org-1', 'payslip-456');
    expect(lastHtml()).toContain('Head of Security');
    expect(lastHtml()).not.toContain('Field Agent');
  });

  it('renders the invoice in Arabic, right-to-left, in the base currency (audit B3)', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      ...ORG_ROW,
      currency: 'USD', // schema default, not the ledger currency
      baseCurrency: 'EGP',
    });
    prisma.invoice.findFirst = jest.fn().mockResolvedValue({
      invoiceNumber: 'INV-0001',
      date: new Date('2026-10-31'),
      dueDate: new Date('2026-11-30'),
      status: 'SENT',
      currencyCode: null,
      customer: { name: 'شركة النيل للتجارة', email: null, phone: null, address: null },
      lines: [
        {
          description: 'استشارات',
          quantity: '1',
          rate: '1000',
          discount: null,
          taxRate: '14',
          amount: '1000',
          item: null,
        },
      ],
      subtotal: '1000',
      taxAmount: '140',
      shippingAmount: null,
      grandTotal: '1140',
      balanceDue: '1140',
      notes: null,
      terms: null,
    });

    await service.generateInvoicePdf('org-1', 'inv-1', 'ar');
    const ar = lastHtml();
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv-1', organizationId: 'org-1', deletedAt: null } }),
    );
    expect(ar).toContain('<html lang="ar" dir="rtl">');
    expect(ar).toContain('الإجمالي');
    expect(ar).toContain('شركة النيل للتجارة');
    expect(ar).toContain("'Noto Sans Arabic'");
    expect(ar).toContain('1,140.00'); // Western digits
    expect(ar).toContain(
      new Intl.NumberFormat('ar-u-nu-latn', { style: 'currency', currency: 'EGP' }).format(1140),
    );
    expect(ar).not.toMatch(/US\$|\$\s?1,140/);

    await service.generateInvoicePdf('org-1', 'inv-1');
    expect(lastHtml()).toContain('<html lang="en" dir="ltr">');
    expect(lastHtml()).toContain('Balance Due:');
  });
  it('prints the billing address of web-created parties, else the import columns', async () => {
    const doc = {
      date: new Date('2026-10-31'),
      dueDate: new Date('2026-11-30'),
      expiryDate: new Date('2026-11-30'),
      status: 'DRAFT',
      currencyCode: null,
      lines: [{ description: 'x', quantity: '1', rate: '100', taxRate: null, amount: '100' }],
      subtotal: '100',
      taxAmount: '0',
      grandTotal: '100',
      balanceDue: '100',
      notes: null,
      terms: null,
    };
    // Created in the web UI: only the billing columns, and a city without a country.
    const webCustomer = {
      name: 'Nile Co',
      address: null,
      city: null,
      country: null,
      billingStreet: '1 Tahrir St',
      billingCity: 'Cairo',
      billingCountry: null,
    };
    prisma.invoice.findFirst = jest
      .fn()
      .mockResolvedValue({ ...doc, invoiceNumber: 'INV-1', customer: webCustomer });
    await service.generateInvoicePdf('org-1', 'inv-1');
    expect(lastHtml()).toContain('1 Tahrir St</p>');
    expect(lastHtml()).toContain('>Cairo</p>');

    prisma.quote = {
      findFirst: jest.fn().mockResolvedValue({ ...doc, quoteNumber: 'Q-1', customer: webCustomer }),
    };
    await service.generateQuotePdf('org-1', 'quote-1');
    expect(lastHtml()).toContain('1 Tahrir St</p>');

    // Imported vendor: the simple columns only.
    prisma.bill = {
      ...prisma.bill,
      findFirst: jest.fn().mockResolvedValue({
        ...doc,
        billNumber: 'B-1',
        vendor: { name: 'Delta', address: '9 Corniche', city: 'Giza', country: 'EG' },
      }),
    };
    await service.generateBillPdf('org-1', 'bill-1');
    expect(lastHtml()).toContain('9 Corniche</p>');
    expect(lastHtml()).toContain('>Giza, EG</p>');

    prisma.customer.findFirst.mockResolvedValue({ id: 'c1', ...webCustomer });
    await service.generateStatementPdf(
      'org-1',
      'c1',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );
    expect(lastHtml()).toContain('1 Tahrir St</p>');
    expect(lastHtml()).toContain('>Cairo</p>');
  });

  it('prices bills, quotes and statements in the document or base currency, never USD (PR #560)', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      ...ORG_ROW,
      currency: 'USD', // schema default, not the ledger currency
      baseCurrency: 'EGP',
    });
    const doc = {
      date: new Date('2026-10-31'),
      dueDate: new Date('2026-11-30'),
      expiryDate: new Date('2026-11-30'),
      status: 'DRAFT',
      lines: [{ description: 'x', quantity: '1', rate: '100', taxRate: null, amount: '100' }],
      subtotal: '100',
      taxAmount: '0',
      grandTotal: '100',
      balanceDue: '100',
      notes: null,
      terms: null,
    };
    const party = { name: 'P', email: null, phone: null, address: null };
    const egp = new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'EGP' }).format(100);

    prisma.bill = {
      ...prisma.bill,
      findFirst: jest
        .fn()
        .mockResolvedValue({ ...doc, billNumber: 'B-1', currencyCode: null, vendor: party }),
    };
    await service.generateBillPdf('org-1', 'bill-1');
    expect(lastHtml()).toContain(egp);

    prisma.quote = {
      findFirst: jest
        .fn()
        .mockResolvedValue({ ...doc, quoteNumber: 'Q-1', currencyCode: 'sar', customer: party }),
    };
    await service.generateQuotePdf('org-1', 'quote-1');
    expect(lastHtml()).toContain(
      new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'SAR' }).format(100),
    );

    await service.generateStatementPdf(
      'org-1',
      'c1',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );
    expect(lastHtml()).toMatch(/EGP/);
    for (const html of renderer.mock.calls.slice(-3).map((c) => String(c[0]))) {
      expect(html).not.toMatch(/US\$|USD/);
    }
  });
});
