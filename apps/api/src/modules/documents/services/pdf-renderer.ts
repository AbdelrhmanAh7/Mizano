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
 *  - every render gets its own browser context (no shared cookies, cache or storage between
 *    renders or tenants), which is always closed;
 *  - every step has a timeout.
 *
 * One Chromium process is shared by all renders and relaunched if it dies: the Raspberry Pi
 * has too little RAM to start a browser per PDF. At most MAX_CONCURRENT_RENDERS pages render
 * at once; later requests wait their turn.
 *
 * In the API image Chromium comes from Alpine (`apk add chromium`, see apps/api/Dockerfile) and
 * is found through PUPPETEER_EXECUTABLE_PATH; Puppeteer's own Chrome download is skipped.
 */

/** Hard limit for launching, loading the content and printing, each. */
export const PDF_RENDER_TIMEOUT_MS = 30_000;

/** Pages rendered at the same time by the shared browser. */
export const MAX_CONCURRENT_RENDERS = 2;

/** Only inline content may be loaded by the page. */
export function isAllowedPdfRequestUrl(url: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  return scheme === 'data' || scheme === 'about';
}

let sharedBrowser: Promise<puppeteer.Browser> | null = null;

function launchBrowser(timeoutMs: number): Promise<puppeteer.Browser> {
  const launching = puppeteer
    .launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // Docker's /dev/shm is 64 MB; Chromium crashes on larger pages without this.
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      timeout: timeoutMs,
    })
    .then((browser) => {
      browser.once('disconnected', () => {
        if (sharedBrowser === launching) sharedBrowser = null;
      });
      return browser;
    });
  // A failed launch is retried by the next render instead of being cached.
  launching.catch(() => {
    if (sharedBrowser === launching) sharedBrowser = null;
  });
  return launching;
}

async function getBrowser(timeoutMs: number): Promise<puppeteer.Browser> {
  if (sharedBrowser) {
    const browser = await sharedBrowser.catch(() => null);
    if (browser?.connected) return browser;
    sharedBrowser = null;
  }
  sharedBrowser = launchBrowser(timeoutMs);
  return sharedBrowser;
}

let activeRenders = 0;
const waiting: Array<() => void> = [];

async function acquireRenderSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return;
  }
  // The slot is handed over by releaseRenderSlot, so activeRenders stays the same.
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseRenderSlot(): void {
  const next = waiting.shift();
  if (next) next();
  else activeRenders -= 1;
}

/** Closes the shared browser (application shutdown). The next render launches a new one. */
export async function closePdfBrowser(): Promise<void> {
  const current = sharedBrowser;
  sharedBrowser = null;
  const browser = await current?.catch(() => null);
  if (browser) await browser.close().catch(() => undefined);
}

/** Render `html` to an A4 PDF in a locked-down headless browser. */
export async function renderHtmlToPdf(
  html: string,
  timeoutMs: number = PDF_RENDER_TIMEOUT_MS,
): Promise<Buffer> {
  await acquireRenderSlot();
  let context: puppeteer.BrowserContext | undefined;
  try {
    const browser = await getBrowser(timeoutMs);
    context = await browser.createBrowserContext();
    const page = await context.newPage();

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
    if (context) await context.close().catch(() => undefined);
    releaseRenderSlot();
  }
}
