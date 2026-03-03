'use client';

import { useToast } from '@/components/ui/use-toast';
import type { CursorPaginatedResponse } from '@/lib/types/table';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import type { AxiosResponse } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrudApi<TCreate, TUpdate> {
  getAll: (params?: Record<string, unknown>) => Promise<AxiosResponse>;
  getAllCursor: (params?: Record<string, unknown>) => Promise<AxiosResponse>;
  getOne: (id: string) => Promise<AxiosResponse>;
  create: (data: TCreate) => Promise<AxiosResponse>;
  update: (id: string, data: TUpdate) => Promise<AxiosResponse>;
  delete: (id: string) => Promise<AxiosResponse>;
}

export interface CrudHooksConfig<_TEntity, TCreate, TUpdate> {
  /** React Query cache key, e.g. ['invoices'] */
  queryKey: string[];
  /** API client object with standard CRUD methods */
  api: CrudApi<TCreate, TUpdate>;
  /** Human-readable entity name for toast messages, e.g. 'Invoice' */
  entityName: string;
  /** Additional query keys to invalidate on create/update/delete */
  relatedKeys?: string[][];
  /** Whether this entity supports cursor pagination (default: true) */
  hasCursor?: boolean;
}

interface MutationError {
  response?: { data?: { message?: string } };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates standard CRUD hooks for an entity.
 *
 * Returns: `useList`, `useInfiniteList`, `useOne`, `useCreate`, `useUpdate`, `useDelete`
 *
 * Usage:
 * ```ts
 * const {
 *   useList: useCustomers,
 *   useInfiniteList: useInfiniteCustomers,
 *   useOne: useCustomer,
 *   useCreate: useCreateCustomer,
 *   useUpdate: useUpdateCustomer,
 *   useDelete: useDeleteCustomer,
 * } = createCrudHooks<Customer, CreateCustomerData, UpdateCustomerData>({
 *   queryKey: ['customers'],
 *   api: customersApi,
 *   entityName: 'Customer',
 * });
 * ```
 */
export function createCrudHooks<TEntity, TCreate, TUpdate>(
  config: CrudHooksConfig<TEntity, TCreate, TUpdate>,
) {
  const { queryKey, api, entityName, relatedKeys = [], hasCursor = true } = config;

  const lowerName = entityName.toLowerCase();

  // ---- useList (offset pagination) ----
  function useList(params?: Record<string, unknown>) {
    return useQuery({
      queryKey: [...queryKey, params],
      queryFn: async () => {
        const response = await api.getAll(params);
        return response.data;
      },
    });
  }

  // ---- useInfiniteList (cursor pagination) ----
  function useInfiniteList(params?: Record<string, unknown>) {
    return useInfiniteTableData<TEntity, Record<string, unknown>>({
      queryKey,
      fetchFn: async (p) => {
        const response = await api.getAllCursor(p);
        return response.data as CursorPaginatedResponse<TEntity>;
      },
      params: params || {},
      enabled: hasCursor,
    });
  }

  // ---- useOne ----
  function useOne(id: string | undefined) {
    return useQuery({
      queryKey: [...queryKey, id],
      queryFn: async () => {
        if (!id) throw new Error(`${entityName} ID is required`);
        const response = await api.getOne(id);
        return response.data as TEntity;
      },
      enabled: !!id,
    });
  }

  // ---- useCreate ----
  function useCreate() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (data: TCreate) => {
        const response = await api.create(data);
        return response.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        for (const key of relatedKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        toast({
          title: `${entityName} created`,
          description: `The ${lowerName} has been created successfully.`,
        });
      },
      onError: (error: MutationError) => {
        toast({
          variant: 'destructive',
          title: `Error creating ${lowerName}`,
          description: error.response?.data?.message || 'An error occurred',
        });
      },
    });
  }

  // ---- useUpdate ----
  function useUpdate() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id, data }: { id: string; data: TUpdate }) => {
        const response = await api.update(id, data);
        return response.data;
      },
      onSuccess: (_: unknown, variables: { id: string; data: TUpdate }) => {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: [...queryKey, variables.id] });
        for (const key of relatedKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        toast({
          title: `${entityName} updated`,
          description: `The ${lowerName} has been updated successfully.`,
        });
      },
      onError: (error: MutationError) => {
        toast({
          variant: 'destructive',
          title: `Error updating ${lowerName}`,
          description: error.response?.data?.message || 'An error occurred',
        });
      },
    });
  }

  // ---- useDelete ----
  function useDelete() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (id: string) => {
        const response = await api.delete(id);
        return response.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        for (const key of relatedKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        toast({
          title: `${entityName} deleted`,
          description: `The ${lowerName} has been deleted successfully.`,
        });
      },
      onError: (error: MutationError) => {
        toast({
          variant: 'destructive',
          title: `Error deleting ${lowerName}`,
          description: error.response?.data?.message || 'An error occurred',
        });
      },
    });
  }

  return { useList, useInfiniteList, useOne, useCreate, useUpdate, useDelete };
}

// ---------------------------------------------------------------------------
// Action Hook Factory
// ---------------------------------------------------------------------------

interface ActionHookConfig {
  /** React Query cache key(s) to invalidate */
  queryKeys: string[][];
  /** The mutation function (receives id) */
  mutationFn: (id: string) => Promise<AxiosResponse>;
  /** Toast title on success */
  successTitle: string;
  /** Toast description on success */
  successDescription: string;
  /** Toast title on error */
  errorTitle: string;
}

/**
 * Creates a simple action mutation hook (e.g. send, void, accept, etc.)
 *
 * Usage:
 * ```ts
 * export const useSendInvoice = createActionHook({
 *   queryKeys: [['invoices'], ['customers']],
 *   mutationFn: (id) => invoicesApi.send(id),
 *   successTitle: 'Invoice sent',
 *   successDescription: 'The invoice has been sent successfully.',
 *   errorTitle: 'Error sending invoice',
 * });
 * ```
 */
export function createActionHook(config: ActionHookConfig) {
  return function useAction() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: config.mutationFn,
      onSuccess: (_: unknown, _id: string) => {
        for (const key of config.queryKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        toast({
          title: config.successTitle,
          description: config.successDescription,
        });
      },
      onError: (error: MutationError) => {
        toast({
          variant: 'destructive',
          title: config.errorTitle,
          description: (error as MutationError).response?.data?.message || 'An error occurred',
        });
      },
    });
  };
}
