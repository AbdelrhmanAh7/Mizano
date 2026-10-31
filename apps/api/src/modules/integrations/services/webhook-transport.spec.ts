import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
  createFetchTransport,
  fetchTransport,
  networkErrorSummary,
} from './webhook-dispatcher.service';

/** The real transport against a local server: status only, and one absolute deadline (CLI review). */
describe('fetchTransport', () => {
  let server: Server;
  let base: string;
  let mode: 'ok' | 'stall' = 'ok';

  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      if (mode === 'ok') {
        res.writeHead(202, { 'content-type': 'text/plain' });
        res.write('accepted');
        return; // never ends the body: the transport must not wait for it
      }
      // 'stall': never send headers
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('returns the status without reading an endless body', async () => {
    mode = 'ok';
    await expect(
      fetchTransport(`${base}/hook`, { headers: {}, body: '{}', timeoutMs: 2000 }),
    ).resolves.toEqual({ status: 202 });
  });

  it('gives up at the deadline when the receiver never answers', async () => {
    mode = 'stall';
    const started = Date.now();
    const error = await fetchTransport(`${base}/hook`, {
      headers: {},
      body: '{}',
      timeoutMs: 200,
    }).catch((e: unknown) => e);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(networkErrorSummary(error)).toContain('(ETIMEDOUT)');
  });

  it('keeps the deadline when the name never resolves (DNS runs inside the attempt)', async () => {
    const stalled = createFetchTransport(() => undefined);
    const started = Date.now();
    const error = await stalled('http://stall.example/hook', {
      headers: {},
      body: '{}',
      timeoutMs: 200,
    }).catch((e: unknown) => e);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(networkErrorSummary(error)).toContain('(ETIMEDOUT)');
  });
});
