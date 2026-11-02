'use client';

import { useQuery } from '@tanstack/react-query';
import { auditLogsApi } from '@/lib/api';

interface AuditLogParams {
  [key: string]: unknown;
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: 'CREATE' | 'UPDATE' | 'DELETE';
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Hook to fetch all audit logs with filtering and pagination
 */
export function useAuditLogs(params?: AuditLogParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const response = await auditLogsApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch audit log statistics
 */
export function useAuditStats(days: number = 30) {
  return useQuery({
    queryKey: ['audit-logs', 'stats', days],
    queryFn: async () => {
      const response = await auditLogsApi.getStats(days);
      return response.data;
    },
  });
}

/**
 * Helper to format audit action for display
 */
export function formatAuditAction(action: string): string {
  const actionMap: Record<string, string> = {
    CREATE: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
  };
  return actionMap[action] || action;
}

/**
 * Helper to get action badge color
 */
export function getActionColor(action: string): string {
  const colorMap: Record<string, string> = {
    CREATE: 'bg-success/10 text-success',
    UPDATE: 'bg-info/10 text-info',
    DELETE: 'bg-destructive/10 text-destructive',
  };
  return colorMap[action] || 'bg-muted text-foreground';
}
