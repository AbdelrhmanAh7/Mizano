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
});
