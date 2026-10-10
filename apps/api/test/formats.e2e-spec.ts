/** Issue #17: real uploads, queue, database, CPU parsers and rules. No extraction stubs. */
import { preflightFormatTools } from './helpers/format-tools-preflight.helper';
import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';

process.env.INTAKE_EXTRACTION_STRATEGY = 'rules';
const fixtures = resolve(__dirname, 'fixtures/formats');

describe('CPU format intake acceptance (e2e)', () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let other: TestTenant;

  beforeAll(async () => {
    await preflightFormatTools();
    app = await createTestApp();
    tenant = await registerTenant(app, 'Formats');
    other = await registerTenant(app, 'FormatsOther');
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  async function upload(name: string, mime: string): Promise<string> {
    const response = await tenant.api
      .post('/ai/document-intake/process')
      .field('language', 'eng')
      .attach('file', readFileSync(resolve(fixtures, name)), { filename: name, contentType: mime });
    expect(response.status).toBe(201);
    return response.body.data.jobId as string;
  }

  async function completed(id: string) {
    const view = await eventually(async () => {
      const response = await tenant.api.get(`/ai/document-intake/${id}/result`);
      expect(response.status).toBe(200);
      expect(['EXTRACTED', 'NEEDS_REVIEW', 'DEAD_LETTER']).toContain(response.body.data.status);
      return response.body.data;
    }, 60000);
    expect(['EXTRACTED', 'NEEDS_REVIEW']).toContain(view.status);
    return view;
  }

  it.each([
    ['later-page-long.pdf', 'application/pdf'],
    ['table-long.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    [
      'strict-table.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['mixed.pdf', 'application/pdf'],
    ['mixed-same-page.pdf', 'application/pdf'],
  ])('%s produces reviewable fields from the actual parser', async (name, mime) => {
    const id = await upload(name, mime);
    const view = await completed(id);
    expect(view.result.extractedFields).toMatchObject({
      documentNumber: 'FMT-17',
      date: '2026-09-01',
      total: '228.0000',
      subtotal: '200.0000',
      tax: '28.0000',
      currency: 'EGP',
    });
    expect(view.result.fieldEvidence.total.text).toContain('228');
    expect(view.result.formatEvidence.readerVersion).toBe('cpu-formats-v1');
    if (name === 'mixed.pdf') {
      expect(view.result.formatEvidence.pages).toEqual([
        { page: 1, route: 'native' },
        { page: 2, route: 'ocr' },
      ]);
    }
    if (name === 'mixed-same-page.pdf') {
      expect(view.result.formatEvidence.pages).toEqual([{ page: 1, route: 'ocr' }]);
      expect(view.status).toBe('NEEDS_REVIEW');
      expect(view.result.extractionWarnings).toContain('PDF_MIXED_CONTENT');
    }
    expect(view.result.rawText).toContain('Grand total:');
    if (
      name === 'later-page-long.pdf' ||
      name === 'table-long.docx' ||
      name === 'strict-table.docx'
    ) {
      expect(view.result.rawText.length).toBeGreaterThan(4000);
      expect(view.result.rawText.indexOf('228.0000')).toBeGreaterThan(4000);
    }
    expect((await other.api.get(`/ai/document-intake/${id}/result`)).status).toBe(404);
    const original = await tenant.api.get(`/ai/document-intake/${id}/original`);
    expect(original.status).toBe(200);
    expect(original.headers['content-type']).toContain(mime);
  });

  it.each([
    ['poor.png', 'image/png', 'UNREADABLE', 'Retake'],
    ['too-many-pages.pdf', 'application/pdf', 'TOO_LARGE', 'Split'],
    ['corrupt.pdf', 'application/pdf', 'CORRUPT', 'Export'],
    ['encrypted.pdf', 'application/pdf', 'ENCRYPTED', 'Remove'],
    [
      'forged-word.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'CORRUPT',
      'Export',
    ],
    [
      'embedded-image.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'UNSUPPORTED_CONTENT',
      'Export',
    ],
    [
      'expanded-too-large.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'TOO_LARGE',
      'Split',
    ],
    [
      'entity.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'CORRUPT',
      'Export',
    ],
  ])('%s gives a repair and never a completed extraction', async (name, mime, code, repair) => {
    const id = await upload(name, mime);
    const view = await eventually(async () => {
      const response = await tenant.api.get(`/ai/document-intake/${id}/result`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'DEAD_LETTER',
        stage: 'error',
        attempts: 1,
      });
      return response.body.data;
    }, 60000);
    expect(view.lastError).toContain(`INTAKE_${code}`);
    expect(view.lastError).toContain(repair);
    if (code === 'ENCRYPTED') expect(view.lastError).toContain('password');
    expect(view.lastError).toMatch(/[\u0600-\u06ff]/);
    expect(view.result).toBeNull();
  });
  it.each([
    ['legacy.doc', 'application/msword'],
    ['disguised.pdf', 'application/pdf'],
    ['disguised.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['legacy.doc', 'application/octet-stream'],
  ])(
    'rejects legacy content %s/%s with bilingual repair and no job',
    async (filename, contentType) => {
      const prisma = getPrisma(app);
      const where = { organizationId: tenant.organizationId };
      const before = await prisma.intakeJob.count({ where });
      const response = await tenant.api
        .post('/ai/document-intake/process')
        .attach('file', readFileSync(resolve(fixtures, 'legacy.doc')), { filename, contentType });
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('INTAKE_UNSUPPORTED_LEGACY_DOC');
      expect(response.body.message).toContain('Save the file as DOCX or PDF and upload again.');
      expect(response.body.message).toContain('احفظ الملف بصيغة DOCX أو PDF ثم ارفعه مجدداً.');
      expect(response.body.data?.jobId).toBeUndefined();
      expect(await prisma.intakeJob.count({ where })).toBe(before);
    },
  );
  it('an oversized upload returns a bilingual split-file repair before creating a job', async () => {
    const response = await tenant.api
      .post('/ai/document-intake/process')
      .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1), {
        filename: 'oversized.pdf',
        contentType: 'application/pdf',
      });
    expect(response.status).toBe(413);
    expect(response.body.message).toContain('INTAKE_TOO_LARGE');
    expect(response.body.message).toContain('Split');
    expect(response.body.message).toMatch(/[\u0600-\u06ff]/);
    expect(response.body.data?.jobId).toBeUndefined();
  });
});
