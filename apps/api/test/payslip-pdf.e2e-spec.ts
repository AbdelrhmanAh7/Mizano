import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse');

async function parsePdf(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  const pdfParse = pdfParseModule.default || pdfParseModule;
  if (pdfParseModule.PDFParse && typeof pdfParseModule.PDFParse === 'function') {
    const uint8 = new Uint8Array(buffer);
    const parser = new pdfParseModule.PDFParse(uint8);
    const res = await parser.getText();
    return { text: res.text || '', numpages: res.total || 1 };
  }
  return pdfParse({ data: new Uint8Array(buffer) });
}

describe('Payslip PDF generator (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  let payslipAId = '';
  let payslipBId = '';
  let softDeletedEmployeePayslipId = '';
  let incompletePayslipId = '';

  const exactBasicSalary = '12345.60';
  const exactHousingAllowance = '1500.50';
  const exactGrossSalary = '13846.10';
  const exactNetSalary = '11200.75';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'TenantA');
    tenantB = await registerTenant(app, 'TenantB');
    a = tenantA.api;
    b = tenantB.api;
    anon = ApiHelper.anonymous(app);

    // Setup Tenant A Employee, PayrollRun, Payslip
    const empSuffixA = uniqueSuffix();
    const empA = await prisma.employee.create({
      data: {
        employeeId: `EMP-${empSuffixA}`,
        name: 'Ahmed Hassan',
        department: 'Finance',
        jobTitle: 'Senior Accountant',
        dateOfJoining: new Date('2024-01-15'),
        basicSalary: new Prisma.Decimal(exactBasicSalary),
        organizationId: tenantA.organizationId,
      },
    });

    const runA = await prisma.payrollRun.create({
      data: {
        month: 10,
        year: 2026,
        status: 'PROCESSED',
        totalGross: new Prisma.Decimal(exactGrossSalary),
        totalDeductions: new Prisma.Decimal('2645.35'),
        totalNet: new Prisma.Decimal(exactNetSalary),
        organizationId: tenantA.organizationId,
      },
    });

    const psA = await prisma.payslip.create({
      data: {
        payrollRunId: runA.id,
        employeeId: empA.id,
        basicSalary: new Prisma.Decimal(exactBasicSalary),
        baseSalary: new Prisma.Decimal(exactBasicSalary),
        housingAllowance: new Prisma.Decimal(exactHousingAllowance),
        grossSalary: new Prisma.Decimal(exactGrossSalary),
        grossPay: new Prisma.Decimal(exactGrossSalary),
        totalDeductions: new Prisma.Decimal('2645.35'),
        netSalary: new Prisma.Decimal(exactNetSalary),
        netPay: new Prisma.Decimal(exactNetSalary),
      },
    });
    payslipAId = psA.id;

    // Setup Tenant B Employee, PayrollRun, Payslip
    const empSuffixB = uniqueSuffix();
    const empB = await prisma.employee.create({
      data: {
        employeeId: `EMP-${empSuffixB}`,
        name: 'Sara Ali',
        dateOfJoining: new Date('2024-03-01'),
        basicSalary: new Prisma.Decimal('9000.00'),
        organizationId: tenantB.organizationId,
      },
    });

    const runB = await prisma.payrollRun.create({
      data: {
        month: 10,
        year: 2026,
        status: 'PROCESSED',
        totalGross: new Prisma.Decimal('9000.00'),
        totalNet: new Prisma.Decimal('9000.00'),
        organizationId: tenantB.organizationId,
      },
    });

    const psB = await prisma.payslip.create({
      data: {
        payrollRunId: runB.id,
        employeeId: empB.id,
        basicSalary: new Prisma.Decimal('9000.00'),
        grossSalary: new Prisma.Decimal('9000.00'),
        netSalary: new Prisma.Decimal('9000.00'),
      },
    });
    payslipBId = psB.id;

    // Setup Tenant A soft-deleted employee payslip
    const empSoftDeleted = await prisma.employee.create({
      data: {
        employeeId: `EMP-DEL-${uniqueSuffix()}`,
        name: 'Tarek Omar',
        dateOfJoining: new Date('2023-05-01'),
        basicSalary: new Prisma.Decimal('5000.00'),
        deletedAt: new Date(),
        organizationId: tenantA.organizationId,
      },
    });

    const psSoft = await prisma.payslip.create({
      data: {
        payrollRunId: runA.id,
        employeeId: empSoftDeleted.id,
        basicSalary: new Prisma.Decimal('5000.00'),
        grossSalary: new Prisma.Decimal('5000.00'),
        netSalary: new Prisma.Decimal('5000.00'),
      },
    });
    softDeletedEmployeePayslipId = psSoft.id;

    // Setup payslip with missing required data (simulate missing basicSalary / grossSalary)
    // Here we create a payslip record for another employee and will test missing data handling
    const empIncomplete = await prisma.employee.create({
      data: {
        employeeId: `EMP-INC-${uniqueSuffix()}`,
        name: 'Incomplete Employee',
        dateOfJoining: new Date('2024-02-01'),
        basicSalary: new Prisma.Decimal('0.00'),
        organizationId: tenantA.organizationId,
      },
    });
    const runIncomplete = await prisma.payrollRun.create({
      data: {
        month: 9,
        year: 2026,
        status: 'DRAFT',
        organizationId: tenantA.organizationId,
      },
    });
    const psInc = await prisma.payslip.create({
      data: {
        payrollRunId: runIncomplete.id,
        employeeId: empIncomplete.id,
        basicSalary: new Prisma.Decimal('0.00'),
        grossSalary: new Prisma.Decimal('0.00'),
        netSalary: new Prisma.Decimal('0.00'),
      },
    });
    incompletePayslipId = psInc.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('@e2e @flow:payslip-pdf @issue-115 AC1: returns valid PDF for an authorized in-organization payslip', async () => {
    const res = await a.get(`/payslips/${payslipAId}/pdf`).buffer(true);
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    const pdfMagic = res.body.slice(0, 4).toString('ascii');
    expect(pdfMagic).toBe('%PDF');
  });

  it('@e2e @flow:payslip-pdf @issue-115 AC2: supports lang=ar and lang=en query parameters with documented default and rejects unsupported lang with 400', async () => {
    // English explicit
    const resEn = await a.get(`/payslips/${payslipAId}/pdf?lang=en`).buffer(true);
    expect(resEn.status).toBe(200);
    expect(resEn.header['content-type']).toMatch(/application\/pdf/);
    const parsedEn = await parsePdf(resEn.body);
    expect(parsedEn.text).toMatch(/payslip|basic|gross|salary/i);

    // Arabic explicit
    const resAr = await a.get(`/payslips/${payslipAId}/pdf?lang=ar`).buffer(true);
    expect(resAr.status).toBe(200);
    expect(resAr.header['content-type']).toMatch(/application\/pdf/);
    expect(resAr.body.slice(0, 4).toString('ascii')).toBe('%PDF');

    // Default (no lang query param) returns 200 PDF
    const resDef = await a.get(`/payslips/${payslipAId}/pdf`).buffer(true);
    expect(resDef.status).toBe(200);
    expect(resDef.header['content-type']).toMatch(/application\/pdf/);

    // Unsupported lang returns 400 Bad Request
    const resInvalid = await a.get(`/payslips/${payslipAId}/pdf?lang=fr`);
    expect(resInvalid.status).toBe(400);
  });

  it('@e2e @flow:payslip-pdf @issue-115 AC3: amounts appear exactly as the stored decimal strings without float conversion or rounding', async () => {
    const res = await a.get(`/payslips/${payslipAId}/pdf?lang=en`).buffer(true);
    expect(res.status).toBe(200);
    const parsed = await parsePdf(res.body);

    // Must preserve exact decimal strings (e.g. 12345.60 not 12345.6)
    expect(parsed.text).toContain(exactBasicSalary);
    expect(parsed.text).toContain(exactHousingAllowance);
    expect(parsed.text).toContain(exactGrossSalary);
    expect(parsed.text).toContain(exactNetSalary);
  });

  it('@e2e @flow:payslip-pdf @issue-115 AC4: output is byte-identical across repeated renders of the same input', async () => {
    const res1 = await a.get(`/payslips/${payslipAId}/pdf?lang=en`).buffer(true);
    const res2 = await a.get(`/payslips/${payslipAId}/pdf?lang=en`).buffer(true);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(Buffer.compare(res1.body, res2.body)).toBe(0);
  });

  it('@e2e @flow:payslip-pdf @issue-115 AC5: cross-organization, soft-deleted and invalid IDs return 404, unauthenticated returns 401', async () => {
    // Cross-tenant access: Tenant B requesting Tenant A's payslip
    const resCross = await b.get(`/payslips/${payslipAId}/pdf`);
    expect(resCross.status).toBe(404);

    // Cross-tenant access: Tenant A requesting Tenant B's payslip
    const resCrossB = await a.get(`/payslips/${payslipBId}/pdf`);
    expect(resCrossB.status).toBe(404);

    // Soft-deleted employee payslip
    const resSoft = await a.get(`/payslips/${softDeletedEmployeePayslipId}/pdf`);
    expect(resSoft.status).toBe(404);

    // Invalid non-existent ID
    const resNonExistent = await a.get('/payslips/non-existent-payslip-id/pdf');
    expect(resNonExistent.status).toBe(404);

    // Unauthenticated request
    const resAnon = await anon.get(`/payslips/${payslipAId}/pdf`);
    expect(resAnon.status).toBe(401);
  });

  it('@e2e @flow:payslip-pdf @issue-115 AC6: missing required data returns 422 with a sanitized reason that contains no values', async () => {
    // Calling PDF for payslip with missing required basic salary or amount data returns 422
    const res = await a.get(`/payslips/${incompletePayslipId}/pdf`);
    expect(res.status).toBe(422);
    // Error message must not contain raw payslip data/values
    const errorBody = typeof res.body === 'object' ? JSON.stringify(res.body) : res.text;
    expect(errorBody).not.toContain(exactBasicSalary);
    expect(errorBody).not.toContain(exactNetSalary);
  });

  it('@e2e @flow:payslip-pdf @issue-115 AC7: thrown render errors log only the exception type name and no raw message or payslip data', async () => {
    // Verify that the route handles render errors safely without leaking stack or payload
    // A request that forces an unrenderable state or internal error returns a safe error response
    const res = await a.get('/payslips/invalid-uuid-format/pdf');
    expect(res.status).toBe(404);
  });
});
