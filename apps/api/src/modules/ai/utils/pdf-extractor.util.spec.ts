import { extractTextFromPdf } from './pdf-extractor.util';

// Minimal valid PDF with "Hello World" text (PDF 1.4, single page, Helvetica font)
const MINIMAL_PDF_BASE64 = [
  'JVBERi0xLjQK', // %PDF-1.4
  'MSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBv', // 1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
  'iagoCjw8Ci9UeXBlIC9QYWdlcwovS2lkcyBbMyAwIFJdCi9Db3VudCAxCj4+CmVuZG9iago', // 2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
  'MyAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDIgMCBSCi9NZWRpYUJveCBbMCAwIDYx', // 3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
  'MiA3OTJdCi9Db250ZW50cyA0IDAgUgovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9GMSA1IDAg', // /Contents 4 0 R /Resources << /Font << /F1 5 0 R
  'Uj4+Pj4+PgplbmRvYmoKNCAwIG9iago8PAovTGVuZ3RoIDQ0Cj4+CnN0cmVhbQpCVC9GMSAx', // 4 0 obj << /Length 44 >> stream BT/F1 1
  'MiBUZiAxMDAgNzAwIFRkIChIZWxsbyBXb3JsZCkgVGogRVRlbmRzdHJlYW0KZW5kb2JqC', // 2 Tf 100 700 Td (Hello World) Tj ET endstream endobj
  'TIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2', // 5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
  'ZXRpY2EKPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZgowMDAwMDAwMD', // xref 0 6 ... trailer
  'A5IDAgbgowMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwNTggMDAwMDAgbgowMDAwMDAwMTE1', // truncated xref for brevity
  'IDAgbgowMDAwMDAwMjU2IDAwMDAwIG4KdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDEgMC', // trailer << /Size 6 /Root 1 0 R
  'BSPj4Kc3RhcnR4cmVmCjQzMwolJUVPRgo=', // startxref 433 %%EOF
].join('');

const MINIMAL_PDF_BUFFER = Buffer.from(MINIMAL_PDF_BASE64, 'base64');
const EXPECTED_TEXT =
  'Hello World. This is a test PDF with enough text content to pass the native text detection threshold.';

// Mock pdf-parse at the module level - return an object with default export
jest.mock('pdf-parse', () => {
  const mockFn = jest.fn<Promise<{ text: string; numpages: number }>, [Buffer | Uint8Array]>(
    async () => ({ text: EXPECTED_TEXT, numpages: 1 }),
  );
  return { default: mockFn };
});

// Import the mocked function to access mock calls
import pdfParse from 'pdf-parse';

describe('extractTextFromPdf - zero-offset buffer handling', () => {
  beforeEach(() => {
    (pdfParse as jest.Mock).mockClear();
  });

  it('extracts text from a Buffer with non-zero byteOffset (sliced from larger pool)', async () => {
    // Create a larger buffer pool and slice our PDF from it, creating non-zero byteOffset
    const pool = Buffer.alloc(MINIMAL_PDF_BUFFER.length + 100);
    // Write some dummy data at the start
    pool.fill(0xff, 0, 50);
    // Copy our PDF at offset 50
    MINIMAL_PDF_BUFFER.copy(pool, 50);
    // Slice to get a Buffer with byteOffset = 50
    const slicedBuffer = pool.subarray(50, 50 + MINIMAL_PDF_BUFFER.length);

    // Verify the sliced buffer has non-zero byteOffset
    expect(slicedBuffer.byteOffset).toBe(50);
    expect(slicedBuffer.length).toBe(MINIMAL_PDF_BUFFER.length);

    // This should work correctly after the fix (passes Uint8Array copy to pdf-parse)
    const result = await extractTextFromPdf(slicedBuffer);

    expect(result.text).toBe(EXPECTED_TEXT);
    expect(result.pageCount).toBe(1);
    expect(result.isNativeText).toBe(true);
  });

  it('extracts text from a regular Buffer (zero byteOffset)', async () => {
    // Regular buffer created directly from base64
    const regularBuffer = Buffer.from(MINIMAL_PDF_BASE64, 'base64');

    const result = await extractTextFromPdf(regularBuffer);

    expect(result.text).toBe(EXPECTED_TEXT);
    expect(result.pageCount).toBe(1);
    expect(result.isNativeText).toBe(true);
  });

  it('passes a Uint8Array with byteOffset === 0 to pdf-parse v1 API', async () => {
    const pool = Buffer.alloc(MINIMAL_PDF_BUFFER.length + 100);
    pool.fill(0xff, 0, 50);
    MINIMAL_PDF_BUFFER.copy(pool, 50);
    const slicedBuffer = pool.subarray(50, 50 + MINIMAL_PDF_BUFFER.length);

    await extractTextFromPdf(slicedBuffer);

    // Verify pdf-parse was called with a Uint8Array that has byteOffset === 0
    expect(pdfParse).toHaveBeenCalledTimes(1);
    const calledWith = (pdfParse as jest.Mock).mock.calls[0][0] as Uint8Array;
    expect(calledWith).toBeInstanceOf(Uint8Array);
    expect(calledWith.byteOffset).toBe(0);
    expect(calledWith.length).toBe(MINIMAL_PDF_BUFFER.length);
  });
});
