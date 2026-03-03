// ============================================
// System Types - Audit, Notifications, Search, Email
// ============================================

import { AuditAction } from '../enums';

// --- Audit Log ---

export interface AuditLog {
  id: string;
  userId: string;
  user?: { id: string; name: string; email: string };
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  organizationId: string;
  createdAt: string;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// --- Notification ---

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  isRead: boolean;
  organizationId: string;
  createdAt: string;
}

// --- Email Log ---

export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  entityType: string;
  entityId: string;
  sentAt: string;
  status: string;
  error?: string | null;
  organizationId: string;
  createdAt: string;
}

// --- Send Document ---

export interface SendDocumentRequest {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  message?: string;
  attachPdf?: boolean;
}

// --- Global Search ---

export interface GlobalSearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
}

export interface GlobalSearchGroup {
  type: string;
  label: string;
  results: GlobalSearchResult[];
}

export interface GlobalSearchResponse {
  data: GlobalSearchResult[];
  groups: GlobalSearchGroup[];
  query: string;
  totalResults: number;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  resultType: string | null;
  resultId: string | null;
  resultTitle: string | null;
  clickedAt: string;
}

// --- Recurring Execution ---

export interface RecurringExecution {
  id: string;
  profileId: string;
  executedAt: string;
  createdEntityType: string;
  createdEntityId: string;
  status: string;
  error?: string | null;
  organizationId: string;
}
