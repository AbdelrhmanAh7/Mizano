import { renderHook, act, waitFor } from '@testing-library/react';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

// ── Mocks ──────────────────────────────────────────────────────

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

  it('reports a 404 (job not visible to this organization) as an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, body: null });

    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });

    expect(result.current.error).toMatch(/no longer available/);
    expect(result.current.isProcessing).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
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
    expect(result.current.error).toBe('Error');
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

  it('surfaces a 409 from retry as an error', async () => {
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
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.error).toMatch(/can no longer be retried/);
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
});
