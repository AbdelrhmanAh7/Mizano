'use client';

import { useToast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

interface BulkFailure {
  id: string;
  reason: string;
}

interface BulkOutcome {
  processed: number;
  failures: BulkFailure[];
}

/** Reads the API's per-record bulk result ({ processed, total, failures }), possibly wrapped in { data }. */
export function readBulkOutcome(result: unknown, requested: number): BulkOutcome {
  const body =
    result && typeof result === 'object' && 'data' in result
      ? (result as { data: unknown }).data
      : result;
  if (body && typeof body === 'object' && 'processed' in body) {
    const { processed, failures } = body as { processed: unknown; failures?: unknown };
    return {
      processed: typeof processed === 'number' ? processed : 0,
      failures: Array.isArray(failures) ? (failures as BulkFailure[]) : [],
    };
  }
  return { processed: requested, failures: [] };
}

interface UseBulkActionOptions<TResult = unknown> {
  /** The async function that performs the bulk action */
  mutationFn: (ids: string[]) => Promise<TResult>;
  /** Query keys to invalidate on success */
  queryKeys: string[][];
  /** Success toast message. {count} will be replaced with the number of items. */
  successMessage?: string;
  /** Error toast message */
  errorMessage?: string;
  /** Callback on success */
  onSuccess?: (result: TResult) => void;
}

export function useBulkAction<TResult = unknown>({
  mutationFn,
  queryKeys,
  successMessage = '{count} items updated successfully',
  errorMessage = 'Failed to perform bulk action',
  onSuccess,
}: UseBulkActionOptions<TResult>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: (ids: string[]) => mutationFn(ids),
    onSuccess: (result, ids) => {
      // Invalidate all related query keys
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      const { processed, failures } = readBulkOutcome(result, ids.length);
      if (failures.length === 0) {
        toast({
          title: 'Success',
          description: successMessage.replace('{count}', String(processed)),
        });
      } else {
        const reasons = Array.from(new Set(failures.map((f) => f.reason)))
          .slice(0, 3)
          .join('; ');
        toast({
          title: processed > 0 ? 'Partially completed' : 'Nothing was processed',
          description: `${processed} of ${processed + failures.length} succeeded. ${failures.length} failed: ${reasons}`,
          variant: processed > 0 ? 'default' : 'destructive',
        });
      }
      setSelectedIds([]);
      onSuccess?.(result);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || errorMessage,
        variant: 'destructive',
      });
    },
  });

  const execute = useCallback(
    (ids: string[]) => {
      setSelectedIds(ids);
      return mutation.mutateAsync(ids);
    },
    [mutation],
  );

  return {
    execute,
    isLoading: mutation.isPending,
    selectedIds,
  };
}
