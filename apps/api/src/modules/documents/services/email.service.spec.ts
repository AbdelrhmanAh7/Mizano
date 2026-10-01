import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const XSS = '<script>alert(1)</script>';

interface WhereClause {
  id?: string;
  payrollRun?: { organizationId?: string };
}

/** Tenant-aware fake: payslip-1 belongs to ORG_A; lookups must be scoped to find it. */
function buildPrisma(): Record<string, Record<string, jest.Mock>> {
  const payslipRow = {
    id: 'payslip-1',
    netPay: { toString: () => '1000' },
    netSalary: { toString: () => '1000' },
    employee: { name: 'Sara', email: 'sara@org-a.example' },
    payrollRun: { month: 9, year: 2026, periodStart: null, periodEnd: null, payDate: null },
  };
  return {
    payslip: {
      findFirst: jest.fn(({ where }: { where: WhereClause }) =>
        Promise.resolve(
          where.id === 'payslip-1' && where.payrollRun?.organizationId === ORG_A
            ? payslipRow
            : null,
        ),
      ),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: ORG_A, name: 'Org A', primaryColor: null }),
    },
    emailLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue({
        payslips: [{ id: 'payslip-1', employeeId: 'emp-1', employee: {} }],
      }),
    },
    invoice: { findFirst: jest.fn() },
  };
}

describe('EmailService.sendPayslip tenant scoping', () => {
  let prisma: Record<string, Record<string, jest.Mock>>;
  let pdf: { generatePayslipPdf: jest.Mock };
  let service: EmailService;
  let sendEmail: jest.SpyInstance;

  beforeEach(() => {
    prisma = buildPrisma();
    pdf = { generatePayslipPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')) };
    service = new EmailService(prisma as unknown as PrismaService, pdf as unknown as PdfService);
    sendEmail = jest
      .spyOn(service as unknown as { sendEmail: () => Promise<void> }, 'sendEmail')
      .mockResolvedValue(undefined);
  });

  it('requires an organization id and touches nothing without it', async () => {
    await expect(service.sendPayslip('', 'payslip-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.sendPayslip(undefined as unknown as string, 'payslip-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payslip.findFirst).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('looks the payslip up through its payroll run organization', async () => {
    const result = await service.sendPayslip(ORG_A, 'payslip-1');

    expect(result.success).toBe(true);
    expect(prisma.payslip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payslip-1', payrollRun: { organizationId: ORG_A } },
      }),
    );
    expect(pdf.generatePayslipPdf).toHaveBeenCalledWith(ORG_A, 'payslip-1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("cannot send, or even see, another organization's payslip", async () => {
    const result = await service.sendPayslip(ORG_B, 'payslip-1');

    expect(result).toEqual({ success: false, error: 'Payslip not found' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(pdf.generatePayslipPdf).not.toHaveBeenCalled();
  });

  it("the failure path is scoped too: another tenant's employee e-mail is never read or logged", async () => {
    await service.sendPayslip(ORG_B, 'payslip-1');

    // every payslip lookup (main + failure path) carried the caller's organization
    for (const [arg] of prisma.payslip.findFirst.mock.calls as Array<[{ where: WhereClause }]>) {
      expect(arg.where.payrollRun).toEqual({ organizationId: ORG_B });
    }
    const log = (prisma.emailLog.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(log).toMatchObject({
      to: 'unknown',
      entityType: 'payslip',
      entityId: 'payslip-1',
      status: 'failed',
      organizationId: ORG_B,
    });
    expect(JSON.stringify(log)).not.toContain('sara@org-a.example');
  });

  it('sendAllPayslips forwards the organization to every payslip send', async () => {
    const spy = jest.spyOn(service, 'sendPayslip').mockResolvedValue({ success: true });
    const result = await service.sendAllPayslips(ORG_A, 'run-1');

    expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1', organizationId: ORG_A } }),
    );
    expect(spy).toHaveBeenCalledWith(ORG_A, 'payslip-1', expect.any(Object));
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0 });
  });
});

describe('EmailService HTML safety', () => {
  it('escapes organization, customer and document fields in the e-mail body', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findFirst.mockResolvedValue({
      invoiceNumber: `INV-${XSS}`,
      date: new Date('2026-09-01'),
      dueDate: new Date('2026-10-01'),
      grandTotal: { toString: () => '10' },
      currencyCode: 'SAR',
      customer: { name: `Cust ${XSS}`, email: 'c@example.com' },
    });
    prisma.organization.findUnique.mockResolvedValue({
      id: ORG_A,
      name: `Org ${XSS}`,
      primaryColor: 'red;} body{background:url(http://evil.example)}',
    });
    const service = new EmailService(
      prisma as unknown as PrismaService,
      {
        generateInvoicePdf: jest.fn(),
      } as unknown as PdfService,
    );
    const sendEmail = jest
      .spyOn(
        service as unknown as {
          sendEmail: (org: string, options: { html: string }) => Promise<void>;
        },
        'sendEmail',
      )
      .mockResolvedValue(undefined);

    await service.sendInvoice(ORG_A, 'inv-1', { to: 'c@example.com', attachPdf: false } as never);

    const html = sendEmail.mock.calls[0][1].html;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('&lt;script&gt;');
  });
});
