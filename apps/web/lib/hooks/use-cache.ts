'use client';

import { useToast } from '@/components/ui/use-toast';
import {
  cacheApi,
  CacheKeysResponse,
  CacheStats,
  DeletePatternResponse,
  FlushCacheResponse,
} from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const CACHE_QUERY_KEYS = {
  stats: ['cache', 'stats'] as const,
  keys: (cursor?: string) => ['cache', 'keys', cursor] as const,
};

/**
 * Fetch cache stats (type, connection, key count, memory, hit rate).
 * Auto-refreshes every 30 seconds.
 */
export function useCacheStats() {
  return useQuery({
    queryKey: CACHE_QUERY_KEYS.stats,
    queryFn: async (): Promise<CacheStats> => {
      const { data } = await cacheApi.getStats();
      // Handle nested data wrapper from TransformInterceptor
      const result = (data as unknown as { data: CacheStats }).data ?? data;
      return result;
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 10000,
  });
}

/**
 * Fetch paginated cache keys for the current organization.
 */
export function useCacheKeys(cursor?: string, count?: number) {
  return useQuery({
    queryKey: CACHE_QUERY_KEYS.keys(cursor),
    queryFn: async (): Promise<CacheKeysResponse> => {
      const { data } = await cacheApi.getKeys(cursor, count);
      const result = (data as unknown as { data: CacheKeysResponse }).data ?? data;
      return result;
    },
    staleTime: 5000,
  });
}

/**
 * Flush all cache keys for the current organization.
 */
export function useFlushCache() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (): Promise<FlushCacheResponse> => {
      const { data } = await cacheApi.flush();
      const result = (data as unknown as { data: FlushCacheResponse }).data ?? data;
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: 'Cache flushed',
        description: `Successfully removed ${data.keysRemoved} cached items.`,
      });
      queryClient.invalidateQueries({ queryKey: ['cache'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to flush cache. Please try again.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Delete cache keys matching a pattern for the current organization.
 */
export function useDeleteCachePattern() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pattern: string): Promise<DeletePatternResponse> => {
      const { data } = await cacheApi.deletePattern(pattern);
      const result = (data as unknown as { data: DeletePatternResponse }).data ?? data;
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: 'Pattern deleted',
        description: `Deleted ${data.keysDeleted} keys matching "${data.pattern}".`,
      });
      queryClient.invalidateQueries({ queryKey: ['cache'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete cache pattern. Please try again.',
        variant: 'destructive',
      });
    },
  });
}
