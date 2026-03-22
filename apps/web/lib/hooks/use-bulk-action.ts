'use client';

import { useToast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

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
      toast({
        title: 'Success',
        description: successMessage.replace('{count}', String(ids.length)),
      });
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
