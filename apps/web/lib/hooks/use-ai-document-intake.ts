import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSession } from 'next-auth/react';
import api from '@/lib/api';

// ============ Types ============

export type IntakeDocumentType = 'BILL' | 'INVOICE' | 'RECEIPT' | 'OTHER';

export type IntakeStage =
  | 'received'
  | 'extracting'
  | 'classifying'
  | 'matching'
  | 'complete'
  | 'error';

/** Durable server-side job status (PostgreSQL), distinct from the progress stage. */
export type IntakeJobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'NEEDS_REVIEW'
  | 'FAILED'
  | 'DEAD_LETTER'
  | 'APPROVED';

export const RETRYABLE_INTAKE_STATUSES: IntakeJobStatus[] = ['FAILED', 'DEAD_LETTER'];

export interface VendorCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface CustomerCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface IntakeLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Extracted tax AMOUNT (not a rate); may be missing or 0 when not found. */
  taxAmount: number | null;
  total: number;
}

export interface DocumentIntakeResult {
  documentType: IntakeDocumentType;
  classificationConfidence: number;
  extractedFields: {
    date: string | null;
    dueDate: string | null;
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    discount: number | null;
    documentNumber: string | null;
    vendorName: string | null;
    vendorTaxId: string | null;
    currency: string | null;
    paymentTerms: string | null;
    customerName: string | null;
    lineItems: IntakeLineItem[];
  };
  fieldConfidence: Record<string, number>;
  ocrConfidence: number;
  matchedVendor: VendorCandidate | null;
  vendorCandidates: VendorCandidate[];
  matchedCustomer: CustomerCandidate | null;
  customerCandidates: CustomerCandidate[];
  duplicateWarning: {
    isDuplicate: boolean;
    existingId: string | null;
    matchType: string;
    similarity: number;
  } | null;
  rawText: string;

  /** Accounting entry suggestion from Ollama */
  accountingEntry?: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  } | null;

  /** Which AI engine was used */
  extractionMethod?: 'ollama-vision' | 'ollama-text' | 'ocr-llm' | 'hybrid-ocr' | 'hybrid-vlm';

  /** Suggested vendor creation when no existing vendor matched */
  suggestCreateVendor?: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
  } | null;
}

/**
 * Confirm line. Money travels as decimal strings; `taxRatePercent` is a
 * percentage ("14" => 14%), never a tax amount. It must be explicit ("0" for
 * no tax) unless `taxRateId` is given — the API rejects unresolved tax.
 */
export interface ConfirmIntakeLineData {
  itemId?: string;
  accountId?: string;
  taxRateId?: string;
  description: string;
  quantity: string;
  rate: string;
  taxRatePercent?: string;
  discountPercent?: string;
}

export interface ConfirmIntakeData {
  type: 'BILL' | 'INVOICE';
  vendorId?: string;
  customerId?: string;
  date: string;
  dueDate: string;
  documentNumber?: string;
  reference?: string;
  currencyCode?: string;
  lines: ConfirmIntakeLineData[];
  notes?: string;
  projectId?: string;
  corrections?: Record<string, unknown>;
  /** Intake job this draft came from; the server approves it once and links the draft. */
  jobId?: string;
}

export interface ConfirmIntakeResponse {
  type: 'bill' | 'invoice';
  id: string;
  number: string;
}

export interface IntakeProgressEvent {
  stage: IntakeStage;
  status?: IntakeJobStatus;
  progress: number;
  message?: string;
  result?: DocumentIntakeResult;
  error?: string;
}

// ============ API Functions ============

const documentIntakeApi = {
  processDocument: async (formData: FormData) => {
    const response = await api.post('/ai/document-intake/process', formData, {
      headers: { 'Content-Type': undefined },
      timeout: 30000, // Short timeout — just uploads the file, processing is async
    });
    return response.data;
  },
  getResult: async (
    jobId: string,
  ): Promise<{
    data: {
      id: string;
      draftDocumentType?: string | null;
      draftDocumentId?: string | null;
      status: IntakeJobStatus;
      stage: IntakeStage;
      progress: number;
      result: DocumentIntakeResult | null;
      lastError: string | null;
    };
  }> => {
    const response = await api.get(`/ai/document-intake/${encodeURIComponent(jobId)}/result`);
    return response.data;
  },
  retry: async (jobId: string) => {
    const response = await api.post(`/ai/document-intake/${encodeURIComponent(jobId)}/retry`);
    return response.data;
  },
  confirmIntake: async (data: ConfirmIntakeData) => {
    const response = await api.post('/ai/document-intake/confirm', data);
    return response.data;
  },
};

// ============ Hooks ============

/**
 * Legacy synchronous document intake hook.
 * Kept for backward compatibility — use useDocumentIntakeStream() instead.
 */
export function useDocumentIntakeProcess() {
  return useMutation({
    mutationFn: documentIntakeApi.processDocument,
  });
}

/** Poll interval and tolerance for the polling fallback. */
const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

export class IntakeStreamHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Progress stream failed with HTTP ${status}`);
    this.name = 'IntakeStreamHttpError';
  }
}

async function getAccessToken(): Promise<string | null> {
  const session = (await getSession()) as { accessToken?: unknown } | null;
  return typeof session?.accessToken === 'string' ? session.accessToken : null;
}

/**
 * Parse an SSE byte stream and invoke `onEvent` for each `data:` payload.
 * Handles events split across chunks and multi-line `data:` fields.
 * Resolves when the stream ends; rejects on read errors.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  const flushEvent = (): void => {
    if (dataLines.length > 0) {
      onEvent(dataLines.join('\n'));
      dataLines = [];
    }
  };

  const handleLine = (rawLine: string): void => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      flushEvent();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    // `event:`, `id:`, `retry:` and comments are not needed by this client.
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handleLine);
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer);
  flushEvent();
}

/**
 * Document intake with real-time progress.
 * POST file → jobId → authenticated fetch() SSE stream (EventSource cannot send
 * the Authorization header). If the stream fails or ends early, falls back to
 * polling GET /:jobId/result through the authenticated API client.
 */
export function useDocumentIntakeStream(): {
  processDocument: (formData: FormData) => Promise<void>;
  stage: IntakeStage | null;
  progress: number;
  message: string | null;
  result: DocumentIntakeResult | null;
  error: string | null;
  isProcessing: boolean;
  isReconnecting: boolean;
  jobId: string | null;
  jobStatus: IntakeJobStatus | null;
  isDuplicate: boolean;
  /** Set when an identical file was already approved: the draft it produced. */
  existingDraft: { type: string; id: string } | null;
  canRetry: boolean;
  retry: () => Promise<void>;
  reset: () => void;
} {
  const [stage, setStage] = useState<IntakeStage | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentIntakeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<IntakeJobStatus | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [existingDraft, setExistingDraft] = useState<{ type: string; id: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => stopAll, [stopAll]);

  const reset = useCallback(() => {
    stopAll();
    setStage(null);
    setProgress(0);
    setMessage(null);
    setResult(null);
    setError(null);
    setIsProcessing(false);
    setIsReconnecting(false);
    setJobId(null);
    setJobStatus(null);
    setIsDuplicate(false);
    setExistingDraft(null);
  }, [stopAll]);

  /** Apply an event; returns true when the job reached a terminal state. */
  const handleProgressEvent = useCallback((event: IntakeProgressEvent): boolean => {
    setStage(event.stage);
    setProgress(event.progress);
    if (event.status) setJobStatus(event.status);
    if (event.message) setMessage(event.message);

    if (event.stage === 'complete') {
      if (event.result) setResult(event.result);
      else setError('Processing finished without a result');
      setIsProcessing(false);
      setIsReconnecting(false);
      return true;
    }
    if (event.stage === 'error') {
      setError(event.error || 'Processing failed');
      setIsProcessing(false);
      setIsReconnecting(false);
      return true;
    }
    return false;
  }, []);

  const fail = useCallback((msg: string) => {
    setError(msg);
    setStage('error');
    setIsProcessing(false);
    setIsReconnecting(false);
  }, []);

  const startPolling = useCallback(
    (jobId: string, signal: AbortSignal) => {
      setIsReconnecting(true);
      let failures = 0;

      const poll = async (): Promise<void> => {
        if (signal.aborted) return;
        try {
          const response = await documentIntakeApi.getResult(jobId);
          const job = response.data;
          failures = 0;
          setIsReconnecting(false);
          const terminal = handleProgressEvent({
            stage: job.stage,
            status: job.status,
            progress: job.progress,
            result: job.result ?? undefined,
            error: job.lastError ?? undefined,
          });
          if (terminal) return;
        } catch (err) {
          const status = (err as { response?: { status?: number } }).response?.status;
          if (status === 404) {
            fail('This scan is no longer available. Please upload the document again.');
            return;
          }
          failures += 1;
          if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            fail('Lost connection while processing the document. Please try again.');
            return;
          }
          setIsReconnecting(true);
        }
        if (!signal.aborted) {
          pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
      };

      void poll();
    },
    [handleProgressEvent, fail],
  );

  const streamProgress = useCallback(
    async (jobId: string, signal: AbortSignal): Promise<boolean> => {
      const token = await getAccessToken();
      const baseUrl = api.defaults.baseURL || '';
      const response = await fetch(
        `${baseUrl}/ai/document-intake/${encodeURIComponent(jobId)}/progress`,
        {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal,
        },
      );
      if (!response.ok || !response.body) {
        throw new IntakeStreamHttpError(response.status);
      }

      let terminal = false;
      await readSseStream(response.body, (data) => {
        try {
          const parsed = JSON.parse(data) as IntakeProgressEvent;
          if (handleProgressEvent(parsed)) terminal = true;
        } catch {
          // Ignore malformed events; polling will reconcile state if the stream ends early.
        }
      });
      return terminal;
    },
    [handleProgressEvent],
  );

  /** Authenticated progress stream, polling as the reconnect path. */
  const followJob = useCallback(
    async (id: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const terminal = await streamProgress(id, controller.signal);
        if (!terminal && !controller.signal.aborted) {
          startPolling(id, controller.signal);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof IntakeStreamHttpError && err.status === 404) {
          fail('This scan is no longer available. Please upload the document again.');
          return;
        }
        // Network drop, 401 (token refresh is handled by the API client), proxy
        // buffering, etc. — continue via polling.
        startPolling(id, controller.signal);
      }
    },
    [streamProgress, startPolling, fail],
  );

  const processDocument = useCallback(
    async (formData: FormData) => {
      reset();
      setIsProcessing(true);
      setStage('received');
      setProgress(5);
      setMessage('Uploading document...');

      let newJobId: string;
      try {
        // Step 1: POST file → job (an identical earlier upload returns the existing job)
        const response = await documentIntakeApi.processDocument(formData);
        newJobId = response.data.jobId;
        setJobId(newJobId);
        setJobStatus(response.data.status ?? null);
        setIsDuplicate(response.data.duplicate === true);
        if (response.data.status === 'APPROVED') {
          // Already approved: show the draft it produced, never a second review form.
          const job = (await documentIntakeApi.getResult(newJobId)).data;
          if (job.draftDocumentId && job.draftDocumentType) {
            setExistingDraft({ type: job.draftDocumentType, id: job.draftDocumentId });
          }
          setStage('complete');
          setProgress(100);
          setIsProcessing(false);
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(msg || 'Failed to process document');
        return;
      }

      await followJob(newJobId);
    },
    [reset, fail, followJob],
  );

  const retry = useCallback(async () => {
    if (!jobId) return;
    stopAll();
    setError(null);
    setStage('received');
    setProgress(0);
    setIsProcessing(true);
    try {
      await documentIntakeApi.retry(jobId);
      setJobStatus('QUEUED');
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      fail(
        status === 409
          ? 'This scan can no longer be retried.'
          : 'Could not retry the scan. Please try again.',
      );
      return;
    }
    await followJob(jobId);
  }, [jobId, stopAll, fail, followJob]);

  return {
    processDocument,
    stage,
    progress,
    message,
    result,
    error,
    isProcessing,
    isReconnecting,
    jobId,
    jobStatus,
    isDuplicate,
    existingDraft,
    canRetry: jobId !== null && jobStatus !== null && RETRYABLE_INTAKE_STATUSES.includes(jobStatus),
    retry,
    reset,
  };
}

export function useDocumentIntakeConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentIntakeApi.confirmIntake,
    onSuccess: (data: { data: ConfirmIntakeResponse }) => {
      const type = data.data.type;
      queryClient.invalidateQueries({ queryKey: [type === 'bill' ? 'bills' : 'invoices'] });
    },
  });
}
