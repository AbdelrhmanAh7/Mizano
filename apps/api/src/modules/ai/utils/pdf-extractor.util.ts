type PdfParseFunction = (data: Uint8Array | Buffer) => Promise<{ text: string; numpages: number }>;

interface PdfParseModule {
  (data: Uint8Array | Buffer): Promise<{ text: string; numpages: number }>;
  default?: PdfParseFunction;
  PDFParse?: {
    new (data: Uint8Array): { getText(): Promise<{ text?: string; total?: number }> };
  };
}

// Direct require of pdf-parse lib avoids the index.js debug execution on module.parent
// eslint-disable-next-line @typescript-eslint/no-var-requires
let pdfParseModule: PdfParseModule;
try {
  pdfParseModule = require('pdf-parse/lib/pdf-parse.js');
} catch {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  pdfParseModule = require('pdf-parse');
}

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  /** true if PDF had embedded text (native), false if likely a scanned image PDF */
  isNativeText: boolean;
}

/**
 * Extract text from a PDF buffer.
 * Uses pdf-parse (local, no external API calls).
 *
 * If the PDF is a scanned image (no embedded text), `isNativeText` will be false
 * and the caller should fall back to OCR (tesseract.js).
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  // Explicit Uint8Array slice avoids Node Buffer pool offset mismatch in pdf.js
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // pdf-parse v2 exports { PDFParse } as a named class
  if (pdfParseModule.PDFParse && typeof pdfParseModule.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse(uint8);
    const result = await parser.getText();

    const text = (result.text || '').trim();
    const pageCount = result.total || 1;

    const isNativeText = text.length > pageCount * 50;
    return { text, pageCount, isNativeText };
  }

  // v1 API: pdfParse(data) → { text, numpages }
  const pdfParse = pdfParseModule.default || pdfParseModule;
  const result = await pdfParse(uint8);
  const text = (result.text || '').trim();
  const pageCount = result.numpages || 1;
  const isNativeText = text.length > pageCount * 50;

  return { text, pageCount, isNativeText };
}
