'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useLoggerStore } from '@/lib/stores/use-logger-store';
import {
  LogEntry,
  LogLevel,
  LogSource,
  LogStatus,
  LogStats,
  GeneratePromptResponse,
} from '@mizano/shared-types';

// ---- Frontend error capture ----

/**
 * Generate a fingerprint for client-side deduplication
 */
function createClientFingerprint(message: string, source: string): string {
  const normalized = message
    .replace(/\d+/g, 'N')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
    .trim();
  // Simple hash
  let hash = 0;
  const raw = `${source}:${normalized}`;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Capture a frontend error and send to backend
 */
async function captureToBackend(params: {
  level: LogLevel;
  source: LogSource;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  url?: string;
  statusCode?: number;
}) {
  try {
    const response = await api.post('/logger/capture', params);
    return response.data as LogEntry;
  } catch {
    // Silently fail - don't let logger errors crash the app
    console.warn('[Mizano Logger] Failed to send log to backend');
    return null;
  }
}

// ---- React Hook ----

export function useLogger() {
  const queryClient = useQueryClient();
  const store = useLoggerStore();
  const capturedErrors = useRef<Set<string>>(new Set());

  // Fetch logs
  const {
    data: logs,
    isLoading: logsLoading,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['logger-logs', store.filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (store.filter.levels?.length) params.set('levels', store.filter.levels.join(','));
      if (store.filter.sources?.length) params.set('sources', store.filter.sources.join(','));
      if (store.filter.categories?.length)
        params.set('categories', store.filter.categories.join(','));
      if (store.filter.statuses?.length) params.set('statuses', store.filter.statuses.join(','));
      if (store.filter.search) params.set('search', store.filter.search);
      if (store.filter.from) params.set('from', store.filter.from);
      if (store.filter.to) params.set('to', store.filter.to);
      const res = await api.get(`/logger/logs?${params.toString()}`);
      return res.data as LogEntry[];
    },
    refetchInterval: 10000, // Poll every 10s
  });

  // Fetch stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['logger-stats'],
    queryFn: async () => {
      const res = await api.get('/logger/stats');
      return res.data as LogStats;
    },
    refetchInterval: 10000,
  });

  // Sync to store
  useEffect(() => {
    if (logs) store.setLogs(logs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs]);

  useEffect(() => {
    if (stats) store.setStats(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: LogStatus }) => {
      const res = await api.post('/logger/update-status', { ids, status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logger-logs'] });
      queryClient.invalidateQueries({ queryKey: ['logger-stats'] });
    },
  });

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async (params?: { ids?: string[]; status?: LogStatus; before?: string }) => {
      const res = await api.delete('/logger/clear', { data: params });
      return res.data;
    },
    onSuccess: () => {
      store.deselectAll();
      queryClient.invalidateQueries({ queryKey: ['logger-logs'] });
      queryClient.invalidateQueries({ queryKey: ['logger-stats'] });
    },
  });

  // Generate prompt mutation
  const generatePromptMutation = useMutation({
    mutationFn: async (params: {
      logIds: string[];
      includeStacks?: boolean;
      includeContext?: boolean;
    }) => {
      const res = await api.post('/logger/generate-prompt', params);
      return res.data as GeneratePromptResponse;
    },
  });

  // Capture frontend error
  const captureError = useCallback((error: Error, context?: Record<string, unknown>) => {
    const fp = createClientFingerprint(error.message, LogSource.FRONTEND);
    if (capturedErrors.current.has(fp)) return;
    capturedErrors.current.add(fp);

    captureToBackend({
      level: LogLevel.ERROR,
      source: LogSource.FRONTEND,
      message: error.message,
      stack: error.stack,
      context: {
        ...context,
        currentUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
    }).then((entry) => {
      if (entry) {
        store.addLog(entry);
        refetchStats();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture frontend warning
  const captureWarning = useCallback((message: string, context?: Record<string, unknown>) => {
    const fp = createClientFingerprint(message, LogSource.FRONTEND);
    if (capturedErrors.current.has(fp)) return;
    capturedErrors.current.add(fp);

    captureToBackend({
      level: LogLevel.WARN,
      source: LogSource.FRONTEND,
      message,
      context: {
        ...context,
        currentUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      },
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
    }).then((entry) => {
      if (entry) {
        store.addLog(entry);
        refetchStats();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture AI model error
  const captureAiError = useCallback((error: Error, modelContext?: Record<string, unknown>) => {
    captureToBackend({
      level: LogLevel.ERROR,
      source: LogSource.AI_MODEL,
      message: error.message,
      stack: error.stack,
      context: modelContext,
    }).then((entry) => {
      if (entry) {
        store.addLog(entry);
        refetchStats();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark as fixed and test-covered
  const markAsFixed = useCallback(
    (ids: string[]) => {
      updateStatusMutation.mutate({ ids, status: LogStatus.FIXED });
      store.updateLogStatus(ids, LogStatus.FIXED);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateStatusMutation],
  );

  const markAsTestCovered = useCallback(
    (ids: string[]) => {
      updateStatusMutation.mutate({ ids, status: LogStatus.TEST_COVERED });
      store.updateLogStatus(ids, LogStatus.TEST_COVERED);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateStatusMutation],
  );

  const markAsIgnored = useCallback(
    (ids: string[]) => {
      updateStatusMutation.mutate({ ids, status: LogStatus.IGNORED });
      store.updateLogStatus(ids, LogStatus.IGNORED);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateStatusMutation],
  );

  // Clear fixed/test-covered logs
  const clearResolved = useCallback(() => {
    const resolvedIds = store.logs
      .filter((l) => l.status === LogStatus.FIXED || l.status === LogStatus.TEST_COVERED)
      .map((l) => l.id);
    if (resolvedIds.length > 0) {
      clearLogsMutation.mutate({ ids: resolvedIds });
      store.removeLogs(resolvedIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.logs]);

  // Clear all
  const clearAll = useCallback(() => {
    clearLogsMutation.mutate({});
    store.setLogs([]);
    store.deselectAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear selected
  const clearSelected = useCallback(() => {
    if (store.selectedIds.length > 0) {
      clearLogsMutation.mutate({ ids: store.selectedIds });
      store.removeLogs(store.selectedIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selectedIds]);

  // Generate Claude prompt
  const generateClaudePrompt = useCallback(
    async (ids?: string[], options?: { includeStacks?: boolean; includeContext?: boolean }) => {
      const targetIds = ids || store.selectedIds;
      if (targetIds.length === 0) return null;
      const result = await generatePromptMutation.mutateAsync({
        logIds: targetIds,
        ...options,
      });
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.selectedIds],
  );

  return {
    // Data
    logs: store.logs,
    stats: store.stats,
    filter: store.filter,
    selectedIds: store.selectedIds,
    isOpen: store.isOpen,

    // Loading states
    logsLoading,
    isClearing: clearLogsMutation.isPending,
    isGeneratingPrompt: generatePromptMutation.isPending,

    // Capture
    captureError,
    captureWarning,
    captureAiError,

    // Filter
    setFilter: store.setFilter,
    resetFilter: store.resetFilter,

    // Selection
    selectLog: store.selectLog,
    deselectLog: store.deselectLog,
    selectAll: store.selectAll,
    deselectAll: store.deselectAll,
    toggleSelection: store.toggleSelection,

    // Actions
    markAsFixed,
    markAsTestCovered,
    markAsIgnored,
    clearResolved,
    clearAll,
    clearSelected,
    generateClaudePrompt,

    // Panel
    setOpen: store.setOpen,
    toggle: store.toggle,

    // Refetch
    refetch: () => {
      refetchLogs();
      refetchStats();
    },
  };
}
