'use client';

import { useQuery } from '@tanstack/react-query';
import { auditLogsApi } from '@/lib/api';

interface AuditLogParams {
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
 * Hook to fetch a single audit log by ID
 */
export function useAuditLog(id: string | undefined) {
  return useQuery({
    queryKey: ['audit-logs', id],
    queryFn: async () => {
      if (!id) throw new Error('Audit log ID is required');
      const response = await auditLogsApi.getOne(id);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch audit logs for a specific entity
 */
export function useEntityAuditLogs(
  entityType: string | undefined,
  entityId: string | undefined,
  params?: Pick<AuditLogParams, 'page' | 'limit' | 'sortOrder'>,
) {
  return useQuery({
    queryKey: ['audit-logs', 'entity', entityType, entityId, params],
    queryFn: async () => {
      if (!entityType || !entityId) {
        throw new Error('Entity type and ID are required');
      }
      const response = await auditLogsApi.getByEntity(entityType, entityId, params);
      return response.data;
    },
    enabled: !!entityType && !!entityId,
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
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
  };
  return colorMap[action] || 'bg-gray-100 text-gray-800';
}
