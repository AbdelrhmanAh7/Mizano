import * as puppeteer from 'puppeteer';

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
  let browser: puppeteer.Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      // /dev/shm is 64 MB in Docker by default; without this flag Chromium
      // crashes on larger pages instead of falling back to /tmp.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: timeoutMs,
    });
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
