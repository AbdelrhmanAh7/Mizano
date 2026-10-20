import { extractTextFromPdf } from './pdf-extractor.util';

// Wrap (not replace) the real pdf-parse so the tests exercise real pdf.js parsing
// and can still inspect what the extractor passed in.
jest.mock('pdf-parse', () =>
  jest.fn(jest.requireActual<(data: Uint8Array) => Promise<unknown>>('pdf-parse')),
);
const pdfParse = jest.requireMock<jest.Mock>('pdf-parse');

const PDF_TEXT = 'Invoice INV-001 total 1500.00 EGP VAT 14 percent issued by Mizano Trading LLC';

/** Build a minimal single-page PDF with a real text layer and a valid xref table. */
function buildTextPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((obj, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** Copy `source` into a larger pool at a non-zero offset and return the Buffer view of it. */
function sliceFromPool(source: Buffer, offset = 50): Buffer {
  const pool = Buffer.alloc(source.length + offset + 100, 0xff);
  source.copy(pool, offset);
  return pool.subarray(offset, offset + source.length);
}

describe('extractTextFromPdf - zero-offset buffer handling', () => {
  const pdf = buildTextPdf(PDF_TEXT);

  beforeEach(() => {
    pdfParse.mockClear();
  });

  it('extracts text from a Buffer with non-zero byteOffset (sliced from a larger pool)', async () => {
    const sliced = sliceFromPool(pdf);
    expect(sliced.byteOffset).toBe(50);
    expect(sliced.buffer.byteLength).toBeGreaterThan(sliced.length);

    const result = await extractTextFromPdf(sliced);

    expect(result.text).toBe(PDF_TEXT);
    expect(result.pageCount).toBe(1);
    expect(result.isNativeText).toBe(true);
  });

  it('hands pdf-parse a fresh zero-offset copy that covers only the PDF bytes', async () => {
    const sliced = sliceFromPool(pdf);

    await extractTextFromPdf(sliced);

    expect(pdfParse).toHaveBeenCalledTimes(1);
    const passed = pdfParse.mock.calls[0][0] as Uint8Array;
    expect(passed).toBeInstanceOf(Uint8Array);
    expect(passed.byteOffset).toBe(0);
    expect(passed.buffer.byteLength).toBe(pdf.length);
    expect(passed.buffer).not.toBe(sliced.buffer);
    expect(Buffer.from(passed).equals(pdf)).toBe(true);
  });

  it('extracts the same text from a plain zero-offset Buffer', async () => {
    const result = await extractTextFromPdf(Buffer.from(pdf));

    expect(result.text).toBe(PDF_TEXT);
    expect(result.isNativeText).toBe(true);
  });
});
