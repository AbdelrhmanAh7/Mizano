'use client';

import {
  QueryClient,
  QueryKey,
  useMutation,
  useQueryClient,
  UseMutationResult,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/api-error';

interface ToastMutationOptions<TVariables, TData> {
  /** next-intl namespace of the toast copy, for example `sales.invoices.toast`. */
  namespace: string;
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Query keys to refresh after success, in order. */
  invalidate: (variables: TVariables) => QueryKey[];
  /** Extra refresh run first, such as `invalidateLedgerQueries` after a posting. */
  beforeInvalidate?: (queryClient: QueryClient) => void;
  /** Success title key; its description is `<key>Description`. */
  success: string;
  /** Error title key; the description is the API message, else `genericError`. */
  error: string;
}

/**
 * A mutation with the standard toasts: translated success title and description, and on failure
 * a destructive toast carrying the API's own message (`getApiErrorMessage`).
 */
export function useToastMutation<TVariables, TData>({
  namespace,
  mutationFn,
  invalidate,
  beforeInvalidate,
  success,
  error,
}: ToastMutationOptions<TVariables, TData>): UseMutationResult<TData, unknown, TVariables> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations(namespace);

  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      beforeInvalidate?.(queryClient);
      for (const queryKey of invalidate(variables)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast({ title: t(success), description: t(`${success}Description`) });
    },
    onError: (err: unknown) => {
      toast({
        variant: 'destructive',
        title: t(error),
        description: getApiErrorMessage(err, t('genericError')),
      });
    },
  });
}
