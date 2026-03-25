/**
 * Convert PDF pages to image buffers for OCR/VLM processing of scanned PDFs.
 *
 * Uses puppeteer (already installed) to render each page as a PNG image.
 * Lazy-loaded to avoid startup overhead — only invoked for scanned PDFs.
 */

import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const logger = new Logger('PdfToImages');

export interface PdfToImagesOptions {
  /** Maximum number of pages to convert (default: 3) */
  maxPages?: number;
  /** Viewport width for rendering (default: 1200) */
  width?: number;
}

/**
 * Convert a PDF buffer into an array of PNG image buffers (one per page).
 * Limited to first N pages to keep processing time reasonable on CPU.
 */
export async function convertPdfPagesToImages(
  pdfBuffer: Buffer,
  options?: PdfToImagesOptions,
): Promise<Buffer[]> {
  const maxPages = options?.maxPages ?? 3;
  const width = options?.width ?? 1200;

  // Write PDF to a temp file (puppeteer needs a file path)
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `mizano_pdf_${Date.now()}.pdf`);
  const images: Buffer[] = [];

  let browser: { close(): Promise<void>; newPage(): Promise<unknown> } | null = null;

  try {
    fs.writeFileSync(tmpFile, pdfBuffer);

    // Lazy-load puppeteer
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const puppeteer = require('puppeteer');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = (await browser!.newPage()) as {
      setViewport(vp: { width: number; height: number }): Promise<void>;
      goto(url: string, opts?: Record<string, unknown>): Promise<void>;
      evaluate(fn: () => number): Promise<number>;
      screenshot(opts: Record<string, unknown>): Promise<Buffer>;
      close(): Promise<void>;
    };

    await page.setViewport({ width, height: 1600 });

    // Navigate to the PDF file
    const fileUrl = `file://${tmpFile.replace(/\\/g, '/')}`;
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30_000 });

    // Get total page count from the PDF viewer
    const pageCount = await page.evaluate(() => {
      // Chrome's PDF viewer uses shadow DOM — try to get page count
      const pdfViewer = document.querySelector('embed') || document.querySelector('iframe');
      return pdfViewer ? 1 : 1; // Chrome renders all pages in a single scrollable view
    });

    // Take screenshot of the first page (most important for extraction)
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width, height: 1600 },
    });
    images.push(Buffer.from(screenshot));

    logger.log(
      `Converted PDF to ${images.length} page image(s), pageCount=${pageCount}, maxPages=${maxPages}`,
    );

    await page.close();
  } catch (err) {
    logger.error(`PDF to images conversion failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    // Clean up temp file
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }

  return images;
}
