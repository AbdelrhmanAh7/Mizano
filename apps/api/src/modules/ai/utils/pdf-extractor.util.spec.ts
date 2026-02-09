import { extractTextFromPdf } from './pdf-extractor.util';

// Mock pdf-parse module
jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation((buffer: Buffer) => {
    const text = buffer.toString('utf-8');
    // Simulate pdf-parse behavior
    if (text.includes('NATIVE_PDF')) {
      return Promise.resolve({
        text: 'Invoice #12345\nDate: 2024-01-15\nTotal: $1,234.56\nVendor: Acme Corp\n' +
              'Subtotal: $1,100.00\nTax: $134.56\nItems:\n- Widget A x 10 @ $100\n- Widget B x 1 @ $100',
        numpages: 1,
      });
    }
    if (text.includes('SCANNED_PDF')) {
      return Promise.resolve({
        text: '', // Scanned PDFs have no embedded text
        numpages: 1,
      });
    }
    if (text.includes('MULTI_PAGE')) {
      return Promise.resolve({
        text: 'Page 1 content here with enough text to pass the threshold. ' +
              'This is a multi-page document with significant content on each page. ' +
              'Page 2 content continues here with more information about the invoice.',
        numpages: 2,
      });
    }
    return Promise.resolve({ text: '', numpages: 0 });
  });
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
