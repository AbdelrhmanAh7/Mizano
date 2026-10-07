/**
 * E2E test for issue #109: Arabic-Indic digit normalization in document intake.
 * Uses the real rules strategy with a PDF containing Arabic-Indic digits in native text.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { ApiHelper } from './helpers/api-client.helper';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.INTAKE_RETRY_BASE_MS = '50';
process.env.INTAKE_LEASE_MS = '1000';
process.env.INTAKE_EXTRACTION_STRATEGY = 'rules';

/** Minimal PDF with native Arabic text containing Arabic-Indic digits. */
function arabicPdfFixture(marker: string): Buffer {
  const text = `شركة الاختبار\nفاتورة ضريبية\nرقم الفاتورة: INV-${marker}\nالتاريخ: ١٥/٠٣/٢٠٢٤\nالمجموع: ١٬٢٣٤٫٥٠ ج.م`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 50}>>stream\nBT /F1 12 Tf 20 200 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

/** Minimal PDF with native Persian text containing Persian digits. */
function persianPdfFixture(marker: string): Buffer {
  const text = `شرکت تست\nصورتحساب\nشماره فاکتور: INV-${marker}\nتاریخ: ۱۵/۰۳/۲۰۲۴\nمجموع: ۱٬۲۳۴٫۵۰ ریال`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 50}>>stream\nBT /F1 12 Tf 20 200 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

/** Minimal PDF with mixed-script (English currency + Arabic-Indic digits). */
function mixedScriptPdfFixture(marker: string): Buffer {
  const text = `Test Vendor\nTax Invoice\nInvoice No: INV-${marker}\nDate: 2024-03-15\nTotal: EGP ١٬٢٣٤٫٥٠`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 50}>>stream\nBT /F1 12 Tf 20 200 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

async function boot(): Promise<INestApplication> {
  // Use the real extraction strategy resolver (no stub)
  return createTestApp();
}

describe('Document intake with Arabic-Indic digits (e2e) @issue-109', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let a: ApiHelper;

  function upload(api: ApiHelper, file: Buffer, name = 'inv.pdf') {
    return api.post('/ai/document-intake/process').attach('file', file, {
      filename: name,
      contentType: 'application/pdf',
    });
  }

  async function waitForStatus(jobId: string, status: IntakeJobStatus) {
    return eventually(async () => {
      const job = await prisma.intakeJob.findFirst({
        where: { id: jobId, organizationId: tenantA.organizationId },
      });
      expect(job?.status).toBe(status);
      return job;
    }, 30000);
  }

  beforeAll(async () => {
    app = await boot();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'IntakeArabicA');
    a = tenantA.api;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('@issue-109 AC1: Arabic-Indic amounts parse correctly', () => {
    it('extracts total from Arabic invoice with Arabic-Indic digits and separators', async () => {
      const fixture = arabicPdfFixture(`AR-${uniqueSuffix()}`);
      const res = await upload(a, fixture, 'arabic-invoice.pdf');
      expect(res.status).toBe(201);
      const jobId = res.body.data.jobId;

      const done = await waitForStatus(jobId, IntakeJobStatus.EXTRACTED);
      expect(done).toBeTruthy();

      const result = await a.get(`/ai/document-intake/${jobId}/result`);
      expect(result.status).toBe(200);
      // AC1: ١٬٢٣٤٫٥٠ parses to 1234.5
      expect(result.body.data.result.extractedFields.total).toBe(1234.5);
      expect(result.body.data.result.extractedFields.currency).toBe('EGP');
      expect(result.body.data.result.extractedFields.date).toBe('2024-03-15');
    });
  });

  describe('@issue-109 AC1: Persian amounts parse correctly', () => {
    it('extracts total from Persian invoice with Persian digits and separators', async () => {
      const fixture = persianPdfFixture(`FA-${uniqueSuffix()}`);
      const res = await upload(a, fixture, 'persian-invoice.pdf');
      expect(res.status).toBe(201);
      const jobId = res.body.data.jobId;

      const done = await waitForStatus(jobId, IntakeJobStatus.EXTRACTED);
      expect(done).toBeTruthy();

      const result = await a.get(`/ai/document-intake/${jobId}/result`);
      expect(result.status).toBe(200);
      // AC1: ۱٬۲۳۴٫۵۰ parses to 1234.5
      expect(result.body.data.result.extractedFields.total).toBe(1234.5);
      expect(result.body.data.result.extractedFields.date).toBe('2024-03-15');
    });
  });

  describe('@issue-109 AC2: Arabic-Indic dates parse correctly', () => {
    it('extracts date from Arabic invoice with Arabic-Indic digits', async () => {
      const fixture = arabicPdfFixture(`AR-DATE-${uniqueSuffix()}`);
      const res = await upload(a, fixture, 'arabic-date-invoice.pdf');
      expect(res.status).toBe(201);
      const jobId = res.body.data.jobId;

      const done = await waitForStatus(jobId, IntakeJobStatus.EXTRACTED);
      expect(done).toBeTruthy();

      const result = await a.get(`/ai/document-intake/${jobId}/result`);
      expect(result.status).toBe(200);
      // AC2: ٠٧/١٠/٢٠٢٦ parses to 2026-10-07 (or 2024-03-15 for our fixture)
      expect(result.body.data.result.extractedFields.date).toBe('2024-03-15');
    });
  });

  describe('@issue-109 AC3: Mixed-script strings parse correctly', () => {
    it('extracts total from mixed-script invoice (English currency + Arabic-Indic digits)', async () => {
      const fixture = mixedScriptPdfFixture(`MIX-${uniqueSuffix()}`);
      const res = await upload(a, fixture, 'mixed-invoice.pdf');
      expect(res.status).toBe(201);
      const jobId = res.body.data.jobId;

      const done = await waitForStatus(jobId, IntakeJobStatus.EXTRACTED);
      expect(done).toBeTruthy();

      const result = await a.get(`/ai/document-intake/${jobId}/result`);
      expect(result.status).toBe(200);
      // AC3: EGP ١٬٢٣٤٫٥٠ parses to 1234.5
      expect(result.body.data.result.extractedFields.total).toBe(1234.5);
      expect(result.body.data.result.extractedFields.currency).toBe('EGP');
    });
  });

  describe('@issue-109 AC4: English-only parser tests pass unchanged', () => {
    it('still extracts English invoices correctly', async () => {
      const text = `Test Company\nTax Invoice\nInvoice No: INV-EN-${uniqueSuffix()}\nDate: 2024-03-15\nTotal: 1,234.50 EGP`;
      const fixture = Buffer.from(
        `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
          `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
          `4 0 obj<</Length ${text.length + 50}>>stream\nBT /F1 12 Tf 20 200 Td (${text}) Tj ET\nendstream endobj\n` +
          `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
      );

      const res = await upload(a, fixture, 'english-invoice.pdf');
      expect(res.status).toBe(201);
      const jobId = res.body.data.jobId;

      const done = await waitForStatus(jobId, IntakeJobStatus.EXTRACTED);
      expect(done).toBeTruthy();

      const result = await a.get(`/ai/document-intake/${jobId}/result`);
      expect(result.status).toBe(200);
      expect(result.body.data.result.extractedFields.total).toBe(1234.5);
      expect(result.body.data.result.extractedFields.currency).toBe('EGP');
      expect(result.body.data.result.extractedFields.date).toBe('2024-03-15');
    });
  });
});
