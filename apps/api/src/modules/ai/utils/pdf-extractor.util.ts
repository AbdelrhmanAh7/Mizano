// pdf-parse v2.x exports { PDFParse } as named export (v1 exported default function)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse');

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
  // pdf-parse v2: new PDFParse(Uint8Array) → .getText() → { text, total, pages }
  const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default || pdfParseModule;

  if (typeof PDFParse === 'function') {
    // v2 API requires Uint8Array, not Buffer
    const uint8 = new Uint8Array(buffer);
    const parser = new PDFParse(uint8);
    const result = await parser.getText();

    const text = (result.text || '').trim();
    const pageCount = result.total || 1;

    const isNativeText = text.length > pageCount * 50;
    return { text, pageCount, isNativeText };
  }

  // v1 fallback: pdfParse(buffer) → { text, numpages }
  const result = await PDFParse(buffer);
  const text = (result.text || '').trim();
  const pageCount = result.numpages || 1;
  const isNativeText = text.length > pageCount * 50;

  return { text, pageCount, isNativeText };
}
