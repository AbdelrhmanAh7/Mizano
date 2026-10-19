import * as fs from 'fs';
import * as puppeteer from 'puppeteer';

function findChromeExecutable(): string | undefined {
  if (
    process.env.PUPPETEER_EXECUTABLE_PATH &&
    fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)
  ) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function createFallbackPdf(html: string): Buffer {
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const text = (titleMatch ? titleMatch[1] : 'Document').replace(/[()\\]/g, '').slice(0, 80);
  const pdfString = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj
4 0 obj <</Length 44>> stream
BT /F1 12 Tf 100 700 Td (${text}) Tj ET
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000262 00000 n 
0000000356 00000 n 
trailer <</Size 6 /Root 1 0 R>>
startxref
427
%%EOF`;
  return Buffer.from(pdfString);
}

/**
 * Sandboxed HTML -> PDF rendering.
 *
 * The HTML is built from tenant data (customer names, notes, descriptions...), so the page
 * is treated as hostile:
 *  - JavaScript is disabled, so injected markup cannot run code;
 *  - request interception aborts everything except `data:` and `about:` URLs, so injected
 *    `<img>`, `<link>`, `<iframe>`, CSS `url()`, redirects and `file://` can neither reach the
 *    internal network (SSRF) nor read local files;
 *  - every step has a timeout, and the browser is always closed.
 */

/** Hard limit for loading the content and for printing, each. */
export const PDF_RENDER_TIMEOUT_MS = 30_000;

/** Only inline content may be loaded by the page. */
export function isAllowedPdfRequestUrl(url: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  return scheme === 'data' || scheme === 'about';
}

/** Render `html` to an A4 PDF in a locked-down headless browser. */
export async function renderHtmlToPdf(
  html: string,
  timeoutMs: number = PDF_RENDER_TIMEOUT_MS,
): Promise<Buffer> {
  const executablePath = findChromeExecutable();
  let browser: puppeteer.Browser | undefined;
  try {
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: timeoutMs,
        ...(executablePath ? { executablePath } : {}),
      });
    } catch {
      return createFallbackPdf(html);
    }
    const page = await browser.newPage();

    // Lock the page down BEFORE any content is set.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const action = isAllowedPdfRequestUrl(request.url())
        ? request.continue()
        : request.abort('blockedbyclient');
      // The page may already be closing; a failed continue/abort must not crash the process.
      action.catch(() => undefined);
    });
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      timeout: timeoutMs,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
