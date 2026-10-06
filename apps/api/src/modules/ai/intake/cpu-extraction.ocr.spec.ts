import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractCpuDocument } from './cpu-extraction';

/**
 * The CPU worker's whole image path with nothing mocked: the pinned Tesseract engine with the
 * bundled Arabic/English assets (no network), then the deterministic invoice rules. The image is
 * rendered, crisp, synthetic text (`__fixtures__/invoice-en.png`), so this proves the wiring from
 * pixels to structured fields, not accuracy on real scans or photos.
 */
describe('CPU extraction with the real OCR engine (synthetic image)', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mizano-cpu-ocr-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reads a rendered English tax invoice into structured fields without any model', async () => {
    const image = await readFile(join(__dirname, '__fixtures__', 'invoice-en.png'));

    const result = await extractCpuDocument(image, 'image/png', directory);

    expect(result).toMatchObject({
      documentType: 'BILL',
      extractionMethod: 'rules',
      extractedFields: {
        documentNumber: 'INV-2024-0042',
        date: '2024-03-15',
        dueDate: '2024-04-14',
        subtotal: 1000,
        tax: 140,
        total: 1140,
        currency: 'EGP',
        vendorTaxId: '123456789',
      },
    });
    expect(result.extractedFields.vendorName).toContain('Cairo Office Supplies');
    expect(result.ocrConfidence).toBeGreaterThanOrEqual(0.6);
    expect(result.extractionWarnings).toEqual([]);
    // Every extracted value points at the recognized line it came from.
    expect(result.fieldEvidence?.total?.text).toContain('1,140.00');
  }, 60_000);
});
