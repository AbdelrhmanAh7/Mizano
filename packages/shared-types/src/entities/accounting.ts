// ============================================
// Accounting Types - Accounts, Journals, Recurring Profiles
// ============================================

import { AccountType, RecurringFrequency, RecurringType } from '../enums';
import { OrganizationEntity, PaginationQuery } from './base';

// --- Account (Chart of Accounts) ---

export interface Account extends OrganizationEntity {
  code: string;
  name: string;
  type: AccountType;
  subType?: string | null;
  parentId: string | null;
  parent?: Account | null;
  children?: Account[];
  currency: string;
  description: string | null;
  openingBalance?: string;
  isActive: boolean;
  isSystem: boolean;
}

export interface CreateAccountRequest {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  currency?: string;
  description?: string;
}

export interface UpdateAccountRequest {
  code?: string;
  name?: string;
  parentId?: string | null;
  currency?: string;
  description?: string;
  isActive?: boolean;
}

export interface AccountQuery extends PaginationQuery {
  type?: AccountType;
  isActive?: boolean;
}

// --- Journal Entry ---

export interface JournalLine {
  id: string;
  journalId: string;
  accountId: string;
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  debit: string;
  credit: string;
  description?: string | null;
}

export interface Journal extends OrganizationEntity {
  journalNumber: string;
  date: string;
  reference: string | null;
  notes: string | null;
  isPosted: boolean;
  reversalOfId?: string | null;
  deletedAt: string | null;
  lines: JournalLine[];
  totalDebit?: string;
  totalCredit?: string;
}

export interface CreateJournalRequest {
  date: string;
  reference?: string;
  notes?: string;
  lines: {
    accountId: string;
    debit?: string;
    credit?: string;
    description?: string;
  }[];
}

export interface UpdateJournalRequest {
  date?: string;
  reference?: string;
  notes?: string;
  lines?: {
    accountId: string;
    debit?: string;
    credit?: string;
    description?: string;
  }[];
}

export interface JournalQuery extends PaginationQuery {
  dateFrom?: string;
  dateTo?: string;
  isPosted?: boolean;
  status?: string;
}

// --- Recurring Profile ---

export interface RecurringProfile extends OrganizationEntity {
  name: string;
  type?: RecurringType | null;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string | null;
  nextRunDate: string;
  isActive: boolean;
  autoPost: boolean;
  autoSend: boolean;
  templateData: Record<string, unknown>;
  entityType: string;
  executionCount: number;
  lastExecutedAt?: string | null;
}

export interface CreateRecurringProfileRequest {
  name: string;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  autoPost?: boolean;
  autoSend?: boolean;
  templateData: Record<string, unknown>;
  entityType: string;
  type?: string;
}

export interface UpdateRecurringProfileRequest {
  name?: string;
  frequency?: RecurringFrequency;
  autoPost?: boolean;
  autoSend?: boolean;
  templateData?: Record<string, unknown>;
}

export interface RecurringProfileQuery extends PaginationQuery {
  isActive?: boolean;
  frequency?: RecurringFrequency;
}
