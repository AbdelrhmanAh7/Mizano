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

const SHUT_DOWN_MESSAGE = 'PDF renderer is shut down';

let activeRenders = 0;
const waiting: Array<{ grant: () => void; refuse: (error: Error) => void }> = [];
/** Resolved when no render holds a slot (used by the shutdown drain). */
let idleListeners: Array<() => void> = [];
/** Set once closePdfBrowser() starts: new and queued renders are refused from then on. */
let shutdown: Promise<void> | null = null;
/** Set when the shared browser is being closed: nothing may launch another one. */
let browserClosed = false;

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
  // A render that outlived the shutdown drain must not launch a browser nobody will close.
  if (browserClosed) throw new Error(SHUT_DOWN_MESSAGE);
  if (sharedBrowser) {
    const browser = await sharedBrowser.catch(() => null);
    if (browser?.connected) return browser;
    sharedBrowser = null;
  }
  sharedBrowser = launchBrowser(timeoutMs);
  return sharedBrowser;
}

async function acquireRenderSlot(timeoutMs: number): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return;
  }
  // The slot is handed over by releaseRenderSlot, so activeRenders stays the same. A request that
  // waits longer than the render timeout gives up and leaves the queue, so a stuck render can't
  // make every later request wait forever.
  await new Promise<void>((resolve, reject) => {
    const entry = {
      grant: (): void => {
        clearTimeout(timer);
        resolve();
      },
      refuse: (error: Error): void => {
        clearTimeout(timer);
        reject(error);
      },
    };
    const timer = setTimeout(() => {
      const index = waiting.indexOf(entry);
      if (index !== -1) waiting.splice(index, 1);
      reject(new Error('PDF render queue timed out'));
    }, timeoutMs);
    waiting.push(entry);
  });
}

function releaseRenderSlot(): void {
  const next = waiting.shift();
  if (next) {
    next.grant();
    return;
  }
  activeRenders -= 1;
  if (activeRenders === 0) {
    const listeners = idleListeners;
    idleListeners = [];
    listeners.forEach((notify) => notify());
  }
}

async function drainAndClose(timeoutMs: number): Promise<void> {
  // 1. Queued renders never start.
  for (const queued of waiting.splice(0)) queued.refuse(new Error(SHUT_DOWN_MESSAGE));
  // 2. Renders already running may finish, but no longer than one render timeout.
  if (activeRenders > 0) {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      new Promise<void>((resolve) => idleListeners.push(resolve)),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
  }
  // 3. Close the browser; from here on nothing can launch another one.
  browserClosed = true;
  const current = sharedBrowser;
  sharedBrowser = null;
  const browser = await current?.catch(() => null);
  if (browser) await browser.close().catch(() => undefined);
}

/**
 * Shuts the renderer down (application shutdown): new and queued renders are refused, running
 * renders get up to `timeoutMs` to finish, then the shared browser is closed. Idempotent; the
 * renderer stays shut down, because Nest closes the HTTP server only after this runs.
 */
export function closePdfBrowser(timeoutMs: number = PDF_RENDER_TIMEOUT_MS): Promise<void> {
  shutdown ??= drainAndClose(timeoutMs);
  return shutdown;
}

/** Test helper: shut down, then make the renderer usable again with a fresh state. */
export async function resetPdfRendererForTests(): Promise<void> {
  await closePdfBrowser();
  shutdown = null;
  browserClosed = false;
  idleListeners = [];
}

/** Render `html` to an A4 PDF in a locked-down headless browser. */
export async function renderHtmlToPdf(
  html: string,
  timeoutMs: number = PDF_RENDER_TIMEOUT_MS,
): Promise<Buffer> {
  if (shutdown) throw new Error(SHUT_DOWN_MESSAGE);
  await acquireRenderSlot(timeoutMs);
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
