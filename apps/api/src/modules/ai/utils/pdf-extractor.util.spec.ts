import { extractTextFromPdf } from './pdf-extractor.util';

// Mock pdf-parse module with v2 API: { PDFParse } named export
jest.mock('pdf-parse', () => {
  class MockPDFParse {
    private text: string;
    private total: number;

    constructor(uint8: Uint8Array) {
      const content = Buffer.from(uint8).toString('utf-8');

      if (content.includes('NATIVE_PDF')) {
        this.text =
          'Invoice #12345\nDate: 2024-01-15\nTotal: $1,234.56\nVendor: Acme Corp\n' +
          'Subtotal: $1,100.00\nTax: $134.56\nItems:\n- Widget A x 10 @ $100\n- Widget B x 1 @ $100';
        this.total = 1;
      } else if (content.includes('SCANNED_PDF')) {
        this.text = '';
        this.total = 1;
      } else if (content.includes('MULTI_PAGE')) {
        this.text =
          'Page 1 content here with enough text to pass the threshold. ' +
          'This is a multi-page document with significant content on each page. ' +
          'Page 2 content continues here with more information about the invoice.';
        this.total = 2;
      } else {
        this.text = '';
        this.total = 0;
      }
    }

    async getText() {
      return { text: this.text, total: this.total, pages: this.total };
    }
  }

  return { PDFParse: MockPDFParse };
});

describe('pdf-extractor.util', () => {
  describe('extractTextFromPdf', () => {
    it('should extract text from native PDF', async () => {
      const buffer = Buffer.from('NATIVE_PDF');
      const result = await extractTextFromPdf(buffer);

      expect(result.text).toContain('Invoice #12345');
      expect(result.text).toContain('$1,234.56');
      expect(result.pageCount).toBe(1);
      expect(result.isNativeText).toBe(true);
    });

    it('should detect scanned PDF (no embedded text)', async () => {
      const buffer = Buffer.from('SCANNED_PDF');
      const result = await extractTextFromPdf(buffer);

      expect(result.text).toBe('');
      expect(result.isNativeText).toBe(false);
    });

    it('should report correct page count', async () => {
      const buffer = Buffer.from('MULTI_PAGE');
      const result = await extractTextFromPdf(buffer);

      expect(result.pageCount).toBe(2);
    });

    it('should use heuristic: 50 chars per page for native detection', async () => {
      const buffer = Buffer.from('NATIVE_PDF');
      const result = await extractTextFromPdf(buffer);
      // Native PDF has 160+ chars, 1 page → 160 > 50 → isNativeText = true
      expect(result.isNativeText).toBe(true);
    });

    it('should handle empty PDF', async () => {
      const buffer = Buffer.from('EMPTY');
      const result = await extractTextFromPdf(buffer);

      expect(result.text).toBe('');
      expect(result.isNativeText).toBe(false);
    });
  });
});
