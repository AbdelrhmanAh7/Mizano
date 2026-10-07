/**
 * @jest-environment node
 */
import { GET } from './route';

describe('GET /api/health (web readiness)', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const originalInternal = process.env.API_INTERNAL_URL;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.API_INTERNAL_URL = 'http://api:6001/api';
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalInternal === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = originalInternal;
  });

  it('answers 200 when the API readiness route answers 2xx', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', api: 'ready' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api:6001/api/health/ready',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('answers 503 when the API reports not ready', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const res = await GET();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ status: 'degraded', api: 'not_ready' });
  });

  it('answers 503 when the API cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ status: 'degraded', api: 'unreachable' });
  });
});
