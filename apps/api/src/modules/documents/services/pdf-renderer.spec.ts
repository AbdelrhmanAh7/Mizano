import * as puppeteer from 'puppeteer';
import { PDF_RENDER_TIMEOUT_MS, isAllowedPdfRequestUrl, renderHtmlToPdf } from './pdf-renderer';

jest.mock('puppeteer', () => ({ launch: jest.fn() }));

type RequestHandler = (request: FakeRequest) => void;

interface FakeRequest {
  url: () => string;
  abort: jest.Mock;
  continue: jest.Mock;
}

function fakeRequest(url: string): FakeRequest {
  return {
    url: () => url,
    abort: jest.fn().mockResolvedValue(undefined),
    continue: jest.fn().mockResolvedValue(undefined),
  };
}

describe('renderHtmlToPdf (sandboxed PDF renderer)', () => {
  const calls: string[] = [];
  let handler: RequestHandler | undefined;
  let page: Record<string, jest.Mock>;
  let browser: { newPage: jest.Mock; close: jest.Mock };

  beforeEach(() => {
    calls.length = 0;
    handler = undefined;
    page = {
      setJavaScriptEnabled: jest.fn(async () => void calls.push('setJavaScriptEnabled')),
      setRequestInterception: jest.fn(async () => void calls.push('setRequestInterception')),
      on: jest.fn((event: string, cb: RequestHandler) => {
        if (event === 'request') handler = cb;
        calls.push(`on:${event}`);
      }),
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
      setContent: jest.fn(async () => void calls.push('setContent')),
      pdf: jest.fn(async () => {
        calls.push('pdf');
        return new Uint8Array([37, 80, 68, 70]);
      }),
    };
    browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    (puppeteer.launch as jest.Mock).mockReset().mockResolvedValue(browser);
  });

  describe('isAllowedPdfRequestUrl', () => {
    it.each([
      'data:image/png;base64,iVBORw0KGgo=',
      'data:text/html,<p>x</p>',
      'DATA:image/gif;base64,R0lG',
      'about:blank',
    ])('allows inline content: %s', (url) => {
      expect(isAllowedPdfRequestUrl(url)).toBe(true);
    });

    it.each([
      'http://169.254.169.254/latest/meta-data/',
      'https://evil.example/pixel.png',
      'http://localhost:6001/api/health',
      'http://10.0.0.5:5432/',
      'file:///etc/passwd',
      'ftp://internal/host',
      'ws://internal:9000/',
      'wss://internal:9000/',
      'blob:https://evil.example/uuid',
      'chrome://settings',
      'javascript:alert(1)',
      '//evil.example/x.png',
      '',
      'not a url',
    ])('blocks everything else: %s', (url) => {
      expect(isAllowedPdfRequestUrl(url)).toBe(false);
    });
  });

  it('disables JavaScript and enables interception before any content is loaded', async () => {
    await renderHtmlToPdf('<html></html>');

    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    const contentAt = calls.indexOf('setContent');
    expect(calls.indexOf('setJavaScriptEnabled')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('setJavaScriptEnabled')).toBeLessThan(contentAt);
    expect(calls.indexOf('setRequestInterception')).toBeLessThan(contentAt);
    expect(calls.indexOf('on:request')).toBeLessThan(contentAt);
  });

  it('aborts http(s), file and other network requests and lets data:/about: through', async () => {
    await renderHtmlToPdf('<img src="http://169.254.169.254/">');
    expect(handler).toBeDefined();

    const blocked = [
      'http://169.254.169.254/latest/meta-data/',
      'https://evil.example/exfil?d=1',
      'file:///etc/passwd',
      'ftp://x/y',
    ].map(fakeRequest);
    const allowed = ['data:image/png;base64,AAAA', 'about:blank'].map(fakeRequest);

    for (const request of [...blocked, ...allowed]) handler?.(request);

    for (const request of blocked) {
      expect(request.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(request.continue).not.toHaveBeenCalled();
    }
    for (const request of allowed) {
      expect(request.continue).toHaveBeenCalledTimes(1);
      expect(request.abort).not.toHaveBeenCalled();
    }
  });

  it('survives a request that can no longer be aborted (page closing)', async () => {
    await renderHtmlToPdf('<p></p>');
    const request = fakeRequest('https://evil.example/');
    request.abort.mockRejectedValue(new Error('Request is already handled'));

    expect(() => handler?.(request)).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve)); // no unhandled rejection
  });

  it('sets a timeout on launch, navigation, content and printing', async () => {
    await renderHtmlToPdf('<p></p>', 1234);

    expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({ timeout: 1234 }));
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(1234);
    expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(1234);
    expect(page.setContent).toHaveBeenCalledWith(
      '<p></p>',
      expect.objectContaining({ timeout: 1234 }),
    );
    expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({ timeout: 1234 }));
  });

  it('uses a bounded default timeout', async () => {
    await renderHtmlToPdf('<p></p>');
    expect(PDF_RENDER_TIMEOUT_MS).toBeGreaterThan(0);
    expect(PDF_RENDER_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(PDF_RENDER_TIMEOUT_MS);
  });

  it('returns the PDF bytes as a Buffer and closes the browser', async () => {
    const pdf = await renderHtmlToPdf('<p></p>');
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.toString()).toBe('%PDF');
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser and rethrows when rendering fails', async () => {
    page.setContent.mockRejectedValue(new Error('Navigation timeout of 30000 ms exceeded'));
    await expect(renderHtmlToPdf('<p></p>')).rejects.toThrow('Navigation timeout');
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('does not render when the lock-down itself fails', async () => {
    page.setRequestInterception.mockRejectedValue(new Error('interception unavailable'));
    await expect(renderHtmlToPdf('<p></p>')).rejects.toThrow('interception unavailable');
    expect(page.setContent).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
