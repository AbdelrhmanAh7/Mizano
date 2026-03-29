import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  taxAmount: number;
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

export interface ConfirmIntakeLineData {
  itemId?: string;
  accountId?: string;
  description: string;
  quantity: number;
  rate: number;
  taxRate?: number;
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
}

export interface ConfirmIntakeResponse {
  type: 'bill' | 'invoice';
  id: string;
  number: string;
}

interface IntakeProgressEvent {
  stage: IntakeStage;
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
  getResult: async (jobId: string) => {
    const response = await api.get(`/ai/document-intake/${jobId}/result`);
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

/**
 * SSE-based document intake with real-time progress.
 * POST file → get jobId → open SSE → stream progress events.
 */
export function useDocumentIntakeStream() {
  const [stage, setStage] = useState<IntakeStage | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentIntakeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    setStage(null);
    setProgress(0);
    setMessage(null);
    setResult(null);
    setError(null);
    setIsProcessing(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const handleProgressEvent = useCallback((event: IntakeProgressEvent) => {
    setStage(event.stage);
    setProgress(event.progress);
    if (event.message) setMessage(event.message);

    if (event.stage === 'complete' && event.result) {
      setResult(event.result);
      setIsProcessing(false);
    } else if (event.stage === 'error') {
      setError(event.error || 'Processing failed');
      setIsProcessing(false);
    }
  }, []);

  const startPollingFallback = useCallback(
    (jobId: string) => {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const response = await documentIntakeApi.getResult(jobId);
          const job = response.data;
          handleProgressEvent({
            stage: job.status,
            progress: job.progress,
            result: job.result,
            error: job.error,
          });
          if (job.status === 'complete' || job.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000);
    },
    [handleProgressEvent],
  );

  const processDocument = useCallback(
    async (formData: FormData) => {
      reset();
      setIsProcessing(true);
      setStage('received');
      setProgress(5);
      setMessage('Uploading document...');

      try {
        // Step 1: POST file → get jobId
        const response = await documentIntakeApi.processDocument(formData);
        const jobId: string = response.data.jobId;

        // Step 2: Open SSE connection for real-time progress
        const baseUrl = api.defaults.baseURL || '';
        const sseUrl = `${baseUrl}/ai/document-intake/${jobId}/progress`;

        try {
          const es = new EventSource(sseUrl);
          eventSourceRef.current = es;

          es.addEventListener('progress', (event: Event) => {
            const messageEvent = event as MessageEvent;
            try {
              const parsed = JSON.parse(messageEvent.data) as IntakeProgressEvent;
              handleProgressEvent(parsed);

              if (parsed.stage === 'complete' || parsed.stage === 'error') {
                es.close();
                eventSourceRef.current = null;
              }
            } catch {
              // Ignore parse errors
            }
          });

          es.onerror = () => {
            es.close();
            eventSourceRef.current = null;
            // Fall back to polling if SSE fails
            startPollingFallback(jobId);
          };
        } catch {
          // SSE not supported — fall back to polling
          startPollingFallback(jobId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Failed to process document');
        setIsProcessing(false);
        setStage('error');
      }
    },
    [reset, handleProgressEvent, startPollingFallback],
  );

  return {
    processDocument,
    stage,
    progress,
    message,
    result,
    error,
    isProcessing,
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
