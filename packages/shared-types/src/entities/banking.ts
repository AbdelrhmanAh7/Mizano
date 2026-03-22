// ============================================
// Banking Types - Bank Accounts, Transactions,
// Rules, Reconciliation
// ============================================

import { BankAccountType, BankTransactionType, ReconciliationStatus } from '../enums';
import { OrganizationEntity, PaginationQuery } from './base';

// --- Bank Account ---

export interface BankAccount extends OrganizationEntity {
  name: string;
  accountNumber?: string | null;
  currency: string;
  type: BankAccountType;
  systemBalance: string;
  bankBalance: string;
  linkedAccountId: string;
  linkedAccount?: { id: string; name: string; code: string };
  isActive: boolean;
}

export interface CreateBankAccountRequest {
  name: string;
  accountNumber?: string;
  currency?: string;
  type: BankAccountType;
  openingBalance?: string;
  linkedAccountId: string;
}

export interface UpdateBankAccountRequest {
  name?: string;
  accountNumber?: string;
  currency?: string;
  type?: BankAccountType;
  isActive?: boolean;
}

export interface BankAccountQuery extends PaginationQuery {
  type?: BankAccountType;
  isActive?: boolean;
}

// --- Bank Transaction ---

export interface SuggestedMatch {
  id: string;
  type: 'INVOICE' | 'BILL' | 'EXPENSE';
  number: string;
  date: string;
  amount: string | number;
  balanceDue: string | number;
  counterpartyName: string;
  confidence: number;
}

export interface BankTransaction extends OrganizationEntity {
  bankAccountId: string;
  bankAccount?: {
    id: string;
    name: string;
    accountNumber?: string;
  };
  date: string;
  type: BankTransactionType;
  amount: string;
  description?: string | null;
  reference?: string | null;
  payee?: string | null;
  status: ReconciliationStatus;
  isReconciled: boolean;
  matchedEntityType?: string | null;
  matchedEntityId?: string | null;
  confidence?: string | null;
  suggestedMatches?: SuggestedMatch[];
}

export interface CreateBankTransactionRequest {
  bankAccountId: string;
  date: string;
  type: BankTransactionType;
  amount: string;
  description?: string;
  reference?: string;
  payee?: string;
}

export interface BankTransactionQuery extends PaginationQuery {
  bankAccountId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

// --- Bank Rule ---

export interface BankRuleCondition {
  field: string;
  operator: string;
  value: string;
}

export interface BankRuleAction {
  type: string;
  accountId?: string;
  vendorId?: string;
  customerId?: string;
}

export interface BankRule extends OrganizationEntity {
  name: string;
  bankAccountId?: string | null;
  conditions: BankRuleCondition[];
  action: BankRuleAction;
  isActive: boolean;
}

export interface CreateBankRuleRequest {
  name: string;
  bankAccountId?: string;
  conditions: BankRuleCondition[];
  action: BankRuleAction;
}

export interface UpdateBankRuleRequest {
  name?: string;
  conditions?: BankRuleCondition[];
  action?: BankRuleAction;
  isActive?: boolean;
}

// --- Reconciliation ---

export interface Reconciliation extends OrganizationEntity {
  bankAccountId: string;
  bankAccount?: BankAccount;
  reconciliationDate: string;
  statementDate: string;
  statementBalance: string;
  systemBalance: string;
  reconciledBalance: string;
  difference: string;
  isCompleted: boolean;
  completedAt?: string | null;
  notes?: string | null;
}

export interface CreateReconciliationRequest {
  bankAccountId: string;
  reconciliationDate: string;
  statementDate: string;
  statementBalance: string;
}

export interface UpdateReconciliationRequest {
  reconciledBalance?: string;
  notes?: string;
  isCompleted?: boolean;
}
