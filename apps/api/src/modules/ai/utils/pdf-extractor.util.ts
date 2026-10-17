import { promises as fs } from 'fs';
import { checkTextLimit, IntakeFormatError } from '../intake/format-error';
import { runFormatTool } from '../intake/format-tools';
import { secureTempFilePath, withSecureTempDir, writeSecureFile } from './secure-temp.util';

export interface PdfPageText {
  page: number;
  text: string;
  isNativeText: boolean;
}
export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  isNativeText: boolean;
  pages: PdfPageText[];
}

/** Bounded Poppler CPU parser; page order is preserved, never truncated. */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  return withSecureTempDir('mizano-pdf-text-', async (dir) => {
    const file = secureTempFilePath(dir, '.pdf');
    await writeSecureFile(file, buffer);
    const info = await runFormatTool('pdfinfo', [file]);
    if (/Encrypted:\s+yes/i.test(info)) throw new IntakeFormatError('ENCRYPTED');
    const count = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
    if (!Number.isInteger(count) || count < 1) throw new IntakeFormatError('CORRUPT');
    if (count > 20) throw new IntakeFormatError('TOO_LARGE');
    // A text header does not prove the whole page is native: totals may be an
    // embedded scan on that same page. OCR any page containing raster content.
    const images = await runFormatTool('pdfimages', ['-list', file]);
    const rasterPages = new Set<number>();
    for (const line of images.split('\n')) {
      const match = /^\s*(\d+)\s+\d+\s+/.exec(line);
      if (!match) continue;
      const page = Number(match[1]);
      if (page < 1 || page > count) throw new IntakeFormatError('CORRUPT');
      rasterPages.add(page);
    }
    const pages: PdfPageText[] = [];
    for (let page = 1; page <= count; page++) {
      const text = await runFormatTool('pdftotext', [
        '-f',
        String(page),
        '-l',
        String(page),
        '-layout',
        '-enc',
        'UTF-8',
        file,
        '-',
      ]);
      pages.push({ page, text, isNativeText: text.trim().length > 0 && !rasterPages.has(page) });
      checkTextLimit(pages.map((p) => p.text).join('\n'));
    }
    return {
      text: pages.map((p) => p.text).join('\n'),
      pageCount: count,
      isNativeText: pages.every((p) => p.isNativeText),
      pages,
    };
  });
}

/** Render only the requested scanned page, with a fixed pixel budget. */
export async function renderPdfPage(buffer: Buffer, page: number): Promise<Buffer> {
  if (!Number.isInteger(page) || page < 1 || page > 20) throw new IntakeFormatError('TOO_LARGE');
  return withSecureTempDir('mizano-pdf-page-', async (dir) => {
    const file = secureTempFilePath(dir, '.pdf');
    const prefix = secureTempFilePath(dir);
    await writeSecureFile(file, buffer);
    await runFormatTool('pdftoppm', [
      '-f',
      String(page),
      '-l',
      String(page),
      '-singlefile',
      '-scale-to',
      '2400',
      '-png',
      file,
      prefix,
    ]);
    try {
      return await fs.readFile(`${prefix}.png`);
    } catch {
      throw new IntakeFormatError('CORRUPT');
    }
  });
}
