/**
 * Convert PDF pages to image buffers for OCR/VLM processing of scanned PDFs.
 *
 * Uses puppeteer (already installed) to render each page as a PNG image.
 * Lazy-loaded to avoid startup overhead — only invoked for scanned PDFs.
 */

import { Logger } from '@nestjs/common';
import { pathToFileURL } from 'url';
import { describeError } from '../../../common/utils/redact';
import { secureTempFilePath, withSecureTempDir, writeSecureFile } from './secure-temp.util';

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

  const images: Buffer[] = [];

  try {
    // puppeteer needs a file path: use a private temp dir, unguessable name, cleaned up in finally
    await withSecureTempDir('mizano-pdf-', async (dir) => {
      const tmpFile = secureTempFilePath(dir, '.pdf');
      await writeSecureFile(tmpFile, pdfBuffer);
      await renderFirstPage(tmpFile, width, maxPages, images);
    });
  } catch (err) {
    logger.error(
      `PDF to images conversion failed: ${describeError(err, { includeMessage: false })}`,
    );
  }

  return images;
}

async function renderFirstPage(
  pdfPath: string,
  width: number,
  maxPages: number,
  images: Buffer[],
): Promise<void> {
  let browser: { close(): Promise<void>; newPage(): Promise<unknown> } | null = null;

  try {
    // Lazy-load puppeteer
    const puppeteer = await import('puppeteer');

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
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
    await page.goto(pathToFileURL(pdfPath).href, { waitUntil: 'networkidle0', timeout: 30_000 });

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
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
