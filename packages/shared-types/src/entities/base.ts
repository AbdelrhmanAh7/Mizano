// ============================================
// Base Interfaces & Common Types
// ============================================

// --- Base Entity Interfaces ---

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeleteEntity extends BaseEntity {
  deletedAt: string | null;
}

export interface OrganizationEntity extends BaseEntity {
  organizationId: string;
}

export interface OrgSoftDeleteEntity extends OrganizationEntity {
  deletedAt: string | null;
}

// --- Address ---

export interface Address {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

// --- Pagination ---

export type SortOrder = 'asc' | 'desc';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CursorPaginationMeta {
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface CursorPaginationQuery {
  cursor?: string;
  take?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

// --- API Response Wrappers ---

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  code?: string;
  details?: Record<string, string[]>;
  timestamp?: string;
  path?: string;
}

// --- Bulk Operations ---

export interface BulkIds {
  ids: string[];
}

export interface BulkFailure {
  id: string;
  reason: string;
}

export interface BulkResult {
  processed: number;
  total: number;
  failures?: BulkFailure[];
}
