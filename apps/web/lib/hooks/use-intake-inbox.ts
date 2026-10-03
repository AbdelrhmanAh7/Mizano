import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { IntakeJobStatus } from '@/lib/hooks/use-ai-document-intake';

export type IntakeSource = 'WEB' | 'TELEGRAM';

export type IntakeBlockerCode =
  | 'NO_RESULT'
  | 'NOT_BILL'
  | 'NO_VENDOR'
  | 'NO_DATE'
  | 'NO_TOTAL'
  | 'NO_LINES'
  | 'INVALID_LINE'
  | 'TAX_UNRESOLVED'
  | 'TOTAL_MISMATCH'
  | 'CURRENCY_MISMATCH';

export interface IntakeInboxSummary {
  documentType: string | null;
  vendorName: string | null;
  documentNumber: string | null;
  date: string | null;
  /** Fixed 4-dp decimal string. */
  total: string | null;
  currency: string | null;
  confidence: number | null;
  readyToApprove: boolean;
  blocker: IntakeBlockerCode | null;
}

export interface IntakeInboxRow {
  id: string;
  status: IntakeJobStatus;
  source: IntakeSource;
  originalFileName: string;
  mimeType: string;
  createdAt: string;
  lastError: string | null;
  draftDocumentType: string | null;
  draftDocumentId: string | null;
  summary: IntakeInboxSummary;
}

export interface IntakeInboxParams {
  status: IntakeJobStatus[];
  source?: IntakeSource;
  from?: string;
  to?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface IntakeInboxPage {
  data: IntakeInboxRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface IntakeBulkResult {
  processed: number;
  total: number;
  failures?: { id: string; reason: string }[];
}

/** Inbox lists poll so newly ingested and processed documents appear without a reload. */
export const INBOX_POLL_MS = 5000;

export const intakeInboxApi = {
  list: async (params: IntakeInboxParams): Promise<IntakeInboxPage> => {
    const response = await api.get('/ai/document-intake/jobs', {
      params: {
        status: params.status.join(','),
        source: params.source || undefined,
        from: params.from || undefined,
        to: params.to || undefined,
        search: params.search || undefined,
        page: params.page,
        limit: params.limit,
      },
    });
    return response.data;
  },
  bulkApprove: async (jobIds: string[]): Promise<IntakeBulkResult> => {
    const response = await api.post('/ai/document-intake/jobs/bulk-approve', { jobIds });
    return response.data;
  },
  retry: async (jobId: string): Promise<void> => {
    await api.post(`/ai/document-intake/${encodeURIComponent(jobId)}/retry`);
  },
  /** The original needs the bearer token, so it is fetched and opened as a blob URL. */
  openOriginal: async (jobId: string): Promise<void> => {
    // Reserve the tab while the click still has user activation. `noopener` would hide
    // the handle even on success, so detach it explicitly before fetching anything.
    const tab = window.open('about:blank', '_blank');
    if (!tab) throw new Error('Could not open the original file');
    let url: string | undefined;
    try {
      tab.opener = null;
      const response = await api.get(`/ai/document-intake/${encodeURIComponent(jobId)}/original`, {
        responseType: 'blob',
      });
      if (tab.closed) return;
      url = URL.createObjectURL(response.data as Blob);
      tab.location.href = url;
      const openedUrl = url;
      setTimeout(() => URL.revokeObjectURL(openedUrl), 60_000);
    } catch (error) {
      tab.close();
      if (url) URL.revokeObjectURL(url);
      throw error;
    }
  },
};

export const INBOX_QUERY_KEY = ['intake-inbox'] as const;

export function useIntakeInbox(params: IntakeInboxParams) {
  return useQuery({
    queryKey: [...INBOX_QUERY_KEY, params],
    queryFn: () => intakeInboxApi.list(params),
    refetchInterval: INBOX_POLL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useBulkApproveIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: intakeInboxApi.bulkApprove,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
      // Approved drafts change bill lists and pending totals.
      void qc.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}

export function useRetryIntakeJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: intakeInboxApi.retry,
    onSettled: () => void qc.invalidateQueries({ queryKey: INBOX_QUERY_KEY }),
  });
}
