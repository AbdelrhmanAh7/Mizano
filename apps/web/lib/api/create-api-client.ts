/**
 * @module create-api-client
 * Generic CRUD API client factory. Generates standard REST methods (list, get,
 * create, update, delete) for any entity endpoint, reducing per-module boilerplate.
 */
import type { AxiosInstance, AxiosResponse } from 'axios';

/**
 * Configuration for the generic CRUD API client factory.
 */
export interface CrudApiConfig {
  /** The API endpoint path, e.g. '/invoices' */
  endpoint: string;
  /** Axios instance to use (defaults to the authenticated `api` instance) */
  instance?: AxiosInstance;
  /** HTTP method for update: 'patch' (default) or 'put' */
  updateMethod?: 'patch' | 'put';
  /** Whether the entity supports cursor-based pagination */
  hasCursor?: boolean;
}

// Axios params accepts any object shape; we use a permissive mapped type
// so that callers can pass typed param interfaces (e.g. InvoiceParams)
// without needing an explicit index signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryParams = Record<string, any>;

/**
 * Standard CRUD API methods returned by the factory.
 */
export interface CrudApi<TCreate = unknown, TUpdate = unknown> {
  getAll: (params?: QueryParams) => Promise<AxiosResponse>;
  getAllCursor: (params?: QueryParams) => Promise<AxiosResponse>;
  getOne: (id: string) => Promise<AxiosResponse>;
  create: (data: TCreate) => Promise<AxiosResponse>;
  update: (id: string, data: TUpdate) => Promise<AxiosResponse>;
  delete: (id: string) => Promise<AxiosResponse>;
}

/**
 * Creates a standard CRUD API client for an entity.
 *
 * Usage:
 * ```ts
 * const customersApi = {
 *   ...createCrudApi<CreateCustomerData, UpdateCustomerData>({
 *     endpoint: '/customers',
 *   }),
 *   getStatement: (id: string, params?: Record<string, unknown>) =>
 *     api.get(`/customers/${id}/statement`, { params }),
 * };
 * ```
 */
export function createCrudApi<TCreate = unknown, TUpdate = unknown>(
  /** @param config - Endpoint path and optional behavior overrides. */
  config: CrudApiConfig,
  /** @param apiInstance - Authenticated Axios instance for making requests. */
  apiInstance: AxiosInstance,
): CrudApi<TCreate, TUpdate> {
  const { endpoint, updateMethod = 'patch', hasCursor = true } = config;

  return {
    getAll: (params?: QueryParams) => apiInstance.get(endpoint, { params }),

    getAllCursor: (params?: QueryParams) =>
      hasCursor
        ? apiInstance.get(`${endpoint}/cursor`, { params })
        : apiInstance.get(endpoint, { params }),

    getOne: (id: string) => apiInstance.get(`${endpoint}/${id}`),

    create: (data: TCreate) => apiInstance.post(endpoint, data),

    update: (id: string, data: TUpdate) => apiInstance[updateMethod](`${endpoint}/${id}`, data),

    delete: (id: string) => apiInstance.delete(`${endpoint}/${id}`),
  };
}

/**
 * Creates bulk operation helpers for an entity.
 * @param endpoint - The API endpoint path, e.g. '/invoices'.
 * @param apiInstance - Authenticated Axios instance for making requests.
 * @returns Object with a `bulkAction` method for batch operations (e.g. bulk-delete, bulk-approve).
 */
export function createBulkApi(endpoint: string, apiInstance: AxiosInstance) {
  return {
    bulkAction: (action: string, ids: string[]) =>
      apiInstance.post(`${endpoint}/bulk-${action}`, { ids }),
  };
}
