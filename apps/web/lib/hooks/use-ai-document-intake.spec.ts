import { renderHook, act, waitFor } from '@testing-library/react';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

// ── Mocks ──────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        retryUnavailable: 'This scan can no longer be retried.',
        unsupportedLegacyDoc: 'Save the file as DOCX or PDF and upload again.',
        unsupportedFormat: 'Upload a PDF, DOCX or supported image.',
        retryFailed: 'Could not retry the scan. Please try again.',
        streamNoResult: 'Processing finished without a result',
        streamFailed: 'Processing failed',
        streamUnavailable: 'This scan is no longer available. Please upload the document again.',
        streamLostConnection: 'Lost connection while processing the document. Please try again.',
        streamUploading: 'Uploading document...',
        streamProcessFailed: 'Failed to process document',
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

const RESULT = {
  documentType: 'BILL',
  extractedFields: {
    total: '123456789012345.1234',
    subtotal: '200.0000',
    tax: '28.0000',
    lineItems: [],
  },
};

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

  it.each([
    ['UNSUPPORTED_LEGACY_DOC', 'Save the file as DOCX or PDF and upload again.'],
    ['UNSUPPORTED', 'Upload a PDF, DOCX or supported image.'],
  ])('localizes synchronous %s upload rejection without following a job', async (code, repair) => {
    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { message: 'INTAKE_' + code + ': bilingual repair' } },
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });
    expect(result.current.error).toBe(repair);
    expect(result.current.jobId).toBeNull();
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.canRetry).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });
  it('uses the localized fallback for an upload error with no message', async () => {
    mockPost.mockRejectedValueOnce(new Error(''));
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });
    expect(result.current.error).toBe('Failed to process document');
    expect(result.current.isProcessing).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
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

  it('preserves fixed 4-dp extracted money through the authenticated stream', async () => {
    const extracted = {
      ...RESULT,
      extractedFields: {
        lineItems: [],
        total: '123456789012345.1234',
        subtotal: '200.0000',
        tax: '28.0000',
      },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: fakeBody([
        `data: ${JSON.stringify({ stage: 'complete', progress: 100, result: extracted })}\n\n`,
      ]),
    });
    const { result } = renderHook(() => useDocumentIntakeStream());
    await act(async () => {
      await result.current.processDocument(new FormData());
    });
    expect(result.current.result?.extractedFields.total).toBe('123456789012345.1234');
    expect(result.current.result?.extractedFields.tax).toBe('28.0000');
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
});
