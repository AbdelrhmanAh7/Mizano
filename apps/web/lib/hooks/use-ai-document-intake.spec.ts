import { renderHook, act, waitFor } from '@testing-library/react';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

// ── Mocks ──────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        retryUnavailable: 'This scan can no longer be retried.',
        retryFailed: 'Could not retry the scan. Please try again.',
        jobLoading: 'Loading scan',
        jobNotFound: 'Scan not found',
        jobLoadFailed: 'Could not load scan',
        jobFailed: 'Scan failed',
        connectionLost: 'Connection lost',
        'stages.received': 'Uploading document',
      }) as Record<string, string>
    )[key],
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue({ accessToken: 'token-123' }),
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    defaults: { baseURL: 'http://api.test/api' },
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────

import api from '@/lib/api';
import { readSseStream, useDocumentIntakeStream } from './use-ai-document-intake';

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

if (typeof globalThis.TextDecoder === 'undefined') {
  Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });
}

function fakeBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new NodeTextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: () =>
        Promise.resolve(
          i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined },
        ),
    }),
  } as unknown as ReadableStream<Uint8Array>;
}

const RESULT = { documentType: 'BILL', extractedFields: { lineItems: [] } };

describe('readSseStream', () => {
  it('parses data lines split across chunks', async () => {
    const events: string[] = [];
    await readSseStream(
      fakeBody(['event: progress\nid: 5\nda', 'ta: {"a":1}\n\n', 'data: {"b":2}\r\n\r\n']),
      (d) => events.push(d),
    );
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('flushes a final event without a trailing blank line', async () => {
    const events: string[] = [];
    await readSseStream(fakeBody(['data: last']), (d) => events.push(d));
    expect(events).toEqual(['last']);
  });
});

describe('useDocumentIntakeStream', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockPost.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    mockPost.mockResolvedValue({
      data: { data: { jobId: 'intake_1', status: 'QUEUED', duplicate: false } },
    });
  });

  it('streams progress with the Authorization header (no EventSource)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody([
        'event: progress\ndata: {"stage":"extracting","progress":20}\n\n',
        `data: ${JSON.stringify({ stage: 'complete', progress: 100, result: RESULT })}\n\n`,
      ]),
    });

    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/ai/document-intake/intake_1/progress',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.isProcessing).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('falls back to authenticated polling when the stream fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    mockGet.mockResolvedValue({
      data: {
        data: {
          id: 'intake_1',
          status: 'EXTRACTED',
          stage: 'complete',
          progress: 100,
          result: RESULT,
          lastError: null,
        },
      },
    });

    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });

    await waitFor(() => expect(result.current.result).toEqual(RESULT));
    expect(mockGet).toHaveBeenCalledWith('/ai/document-intake/intake_1/result');
  });

  it.each([403, 404])(
    'reports HTTP %s (job not visible to this organization) as an error',
    async (status) => {
      fetchMock.mockResolvedValue({ ok: false, status, body: null });

      const { result } = renderHook(() => useDocumentIntakeStream());
      await act(async () => {
        await result.current.processDocument(new FormData());
      });

      expect(result.current.error).toBe('Scan not found');
      expect(result.current.isProcessing).toBe(false);
      expect(mockGet).not.toHaveBeenCalled();
    },
  );
  it('exposes the durable status and flags a duplicate upload', async () => {
    mockPost.mockResolvedValue({
      data: { data: { jobId: 'intake_1', status: 'NEEDS_REVIEW', duplicate: true } },
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody([
        `data: ${JSON.stringify({ stage: 'complete', status: 'NEEDS_REVIEW', progress: 100, result: RESULT })}

`,
      ]),
    });

    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });

    expect(result.current.isDuplicate).toBe(true);
    expect(result.current.jobId).toBe('intake_1');
    expect(result.current.jobStatus).toBe('NEEDS_REVIEW');
    expect(result.current.canRetry).toBe(false);
  });

  it('offers retry for a dead-lettered job and re-follows it after POST /retry', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: fakeBody([
          `data: ${JSON.stringify({ stage: 'error', status: 'DEAD_LETTER', progress: 0, error: 'Error' })}

`,
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: fakeBody([
          `data: ${JSON.stringify({ stage: 'complete', status: 'EXTRACTED', progress: 100, result: RESULT })}

`,
        ]),
      });

    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });
    expect(result.current.error).toBe('Scan failed');
    expect(result.current.jobStatus).toBe('DEAD_LETTER');
    expect(result.current.canRetry).toBe(true);

    await act(async () => {
      await result.current.retry();
    });

    expect(mockPost).toHaveBeenLastCalledWith('/ai/document-intake/intake_1/retry');
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.error).toBeNull();
    expect(result.current.canRetry).toBe(false);
  });

  it.each(['EXTRACTED', 'PROCESSING'])('reconciles %s after a retry conflict', async (status) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody([
        `data: ${JSON.stringify({ stage: 'error', status: 'DEAD_LETTER', progress: 0, error: 'x' })}

`,
      ]),
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });
    mockPost.mockRejectedValueOnce({ response: { status: 409 } });
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          status,
          stage: status === 'PROCESSING' ? 'extracting' : 'complete',
          progress: 50,
          result: RESULT,
          lastError: null,
        },
      },
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: fakeBody([]) });
    mockGet.mockResolvedValue({ data: { data: { status, stage: 'extracting', progress: 50 } } });
    await act(async () => {
      await result.current.retry();
    });
    expect(mockGet).toHaveBeenLastCalledWith('/ai/document-intake/intake_1/result');
    expect(result.current.jobStatus).toBe(status);
    expect(result.current.canRetry).toBe(false);
    if (status === 'PROCESSING') {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.isProcessing).toBe(true);
      expect(result.current.error).toBeNull();
    } else {
      expect(result.current.error).toMatch(/can no longer be retried/);
      expect(result.current.isProcessing).toBe(false);
    }
  });

  it('shows the existing draft for a duplicate of an APPROVED job, without following the stream', async () => {
    mockPost.mockResolvedValue({
      data: { data: { jobId: 'intake_1', status: 'APPROVED', duplicate: true } },
    });
    mockGet.mockResolvedValue({
      data: {
        data: {
          id: 'intake_1',
          status: 'APPROVED',
          stage: 'complete',
          progress: 100,
          result: RESULT,
          lastError: null,
          draftDocumentType: 'bill',
          draftDocumentId: 'bill_9',
        },
      },
    });

    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });

    expect(result.current.existingDraft).toEqual({ type: 'bill', id: 'bill_9' });
    expect(result.current.result).toBeNull();
    expect(result.current.isProcessing).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('loads an extracted deep link without uploading or streaming', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: 'NEEDS_REVIEW',
          stage: 'complete',
          progress: 100,
          result: RESULT,
        },
      },
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('telegram/job');
    });
    expect(mockGet).toHaveBeenCalledWith('/ai/document-intake/telegram%2Fjob/result');
    expect(result.current.jobId).toBe('telegram/job');
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.isProcessing).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 404])('localizes HTTP %s and permits a read-only reload', async (status) => {
    mockGet.mockRejectedValueOnce({ response: { status } });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('missing');
    });
    expect(result.current.error).toBe('Scan not found');
    expect(result.current.isProcessing).toBe(false);
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          status: 'EXTRACTED',
          stage: 'complete',
          progress: 100,
          result: RESULT,
        },
      },
    });
    await act(async () => {
      await result.current.loadJob('missing');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual(RESULT);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('follows progress for a queued deep link', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: 'QUEUED',
          stage: 'received',
          progress: 5,
          result: null,
        },
      },
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody([
        `data: ${JSON.stringify({ stage: 'complete', status: 'EXTRACTED', progress: 100, result: RESULT })}\n\n`,
      ]),
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('queued');
    });
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.progress).toBe(100);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('opens the linked draft for an approved deep link', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: 'APPROVED',
          stage: 'complete',
          progress: 100,
          result: RESULT,
          draftDocumentId: 'bill_1',
          draftDocumentType: 'bill',
        },
      },
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('approved');
    });
    expect(result.current.existingDraft).toEqual({ type: 'bill', id: 'bill_1' });
    expect(result.current.result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('localizes an empty result when a queued deep link finishes', async () => {
    mockGet.mockResolvedValue({
      data: { data: { status: 'QUEUED', stage: 'received', progress: 0, result: null } },
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody(['data: {"stage":"complete","status":"EXTRACTED","progress":100}\n\n']),
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('empty-queued');
    });
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it('distinguishes an empty extracted job from loading', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: 'EXTRACTED',
          stage: 'complete',
          progress: 100,
          result: null,
        },
      },
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('empty');
    });
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it('exposes loading and ignores a response after reset', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { result } = renderHook(() => useDocumentIntakeStream());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.loadJob('old');
    });
    expect(result.current.isProcessing).toBe(true);
    expect(result.current.message).toBe('Loading scan');
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      resolveRequest({ data: { data: { status: 'EXTRACTED', result: RESULT } } });
      await pending;
    });
    expect(result.current.result).toBeNull();
    expect(result.current.jobId).toBeNull();
  });

  it('keeps the newer job when an earlier lookup finishes last', async () => {
    let resolveOld!: (value: unknown) => void;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    mockGet.mockResolvedValueOnce({
      data: { data: { status: 'EXTRACTED', stage: 'complete', progress: 100, result: RESULT } },
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    let oldRequest!: Promise<void>;
    act(() => {
      oldRequest = result.current.loadJob('old');
    });
    await act(async () => {
      await result.current.loadJob('new');
    });
    await act(async () => {
      resolveOld({
        data: { data: { status: 'FAILED', stage: 'error', progress: 0, result: null } },
      });
      await oldRequest;
    });
    expect(result.current.jobId).toBe('new');
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.jobStatus).toBe('EXTRACTED');
    expect(result.current.error).toBeNull();
  });

  it.each(['FAILED', 'DEAD_LETTER'])(
    'offers the existing processing retry for %s deep links',
    async (status) => {
      mockGet.mockResolvedValue({
        data: { data: { status, stage: 'error', progress: 0, result: null } },
      });
      const { result } = renderHook(() => useDocumentIntakeStream());
      await act(async () => {
        await result.current.loadJob('failed');
      });
      expect(result.current.error).toBe('Scan failed');
      expect(result.current.canRetry).toBe(true);
      expect(result.current.isProcessing).toBe(false);
    },
  );

  it('uses a localized load failure without exposing server messages', async () => {
    mockGet.mockRejectedValue(new Error('private server data'));
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('broken');
    });
    expect(result.current.error).toBe('Could not load scan');
  });

  it.each(['resolve', 'reject'])('ignores a cancelled upload that later %ss', async (outcome) => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    mockPost.mockImplementationOnce(
      () =>
        new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    const { result } = renderHook(() => useDocumentIntakeStream());
    let upload!: Promise<void>;
    act(() => {
      upload = result.current.processDocument(new FormData());
    });
    mockGet.mockResolvedValueOnce({
      data: { data: { status: 'EXTRACTED', stage: 'complete', progress: 100, result: RESULT } },
    });
    await act(async () => {
      await result.current.loadJob('new');
    });
    await act(async () => {
      if (outcome === 'resolve') resolve({ data: { data: { jobId: 'old', status: 'QUEUED' } } });
      else reject(new Error('private data'));
      await upload;
    });
    expect(result.current.jobId).toBe('new');
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('ignores a cancelled retry that later %ss', async (outcome) => {
    mockGet.mockResolvedValueOnce({
      data: { data: { status: 'FAILED', stage: 'error', progress: 0 } },
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('failed');
    });
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    mockPost.mockImplementationOnce(
      () =>
        new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    let retry!: Promise<void>;
    act(() => {
      retry = result.current.retry();
    });
    mockGet.mockResolvedValueOnce({
      data: { data: { status: 'EXTRACTED', stage: 'complete', progress: 100, result: RESULT } },
    });
    await act(async () => {
      await result.current.loadJob('new');
    });
    await act(async () => {
      if (outcome === 'resolve') resolve({ data: {} });
      else reject(new Error('private data'));
      await retry;
    });
    expect(result.current.jobId).toBe('new');
    expect(result.current.jobStatus).toBe('EXTRACTED');
    expect(result.current.result).toEqual(RESULT);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reconciles an APPROVED progress event to the existing draft rather than extraction', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: { data: { status: 'QUEUED', stage: 'received', progress: 0 } },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            status: 'APPROVED',
            stage: 'complete',
            progress: 100,
            result: RESULT,
            draftDocumentType: 'invoice',
            draftDocumentId: 'invoice_1',
          },
        },
      });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody([
        `data: ${JSON.stringify({ status: 'APPROVED', stage: 'complete', progress: 100, result: RESULT })}\n\n`,
      ]),
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('approved-later');
    });
    await waitFor(() =>
      expect(result.current.existingDraft).toEqual({ type: 'invoice', id: 'invoice_1' }),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it('keeps an approved job without a draft in the empty state', async () => {
    mockGet.mockResolvedValue({
      data: { data: { status: 'APPROVED', stage: 'complete', progress: 100, result: RESULT } },
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.loadJob('approved-empty');
    });
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it('ignores polling that finishes after reset', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    let resolve!: (value: unknown) => void;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      resolve({
        data: { data: { status: 'EXTRACTED', stage: 'complete', progress: 100, result: RESULT } },
      });
    });
    expect(result.current.result).toBeNull();
    expect(result.current.jobId).toBeNull();
  });

  it('displays localized failure instead of raw extraction errors', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody([
        'data: {"stage":"error","status":"FAILED","progress":0,"error":"private document data"}\n\n',
      ]),
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });
    expect(result.current.error).toBe('Scan failed');
  });
});
