// ============================================
// Purchases Types - Vendors, Bills, Expenses,
// Vendor Credits, Payments Made
// ============================================

import { BillStatus, ExpenseStatus, PaymentMode } from '../enums';
import { Address, OrgSoftDeleteEntity, PaginationQuery } from './base';

// --- Vendor ---

export interface Vendor extends OrgSoftDeleteEntity {
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  taxId: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  billingStreet: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  paymentTerms: number;
  outstandingBalance?: string;
}

export interface CreateVendorRequest {
  name: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  taxId?: string | null;
  billingAddress?: Address;
  paymentTerms?: number;
}

export interface UpdateVendorRequest extends Partial<CreateVendorRequest> {}

export interface VendorQuery extends PaginationQuery {}

export interface VendorStatement {
  vendor: Vendor;
  bills: {
    id: string;
    billNumber: string;
    date: string;
    dueDate: string;
    grandTotal: string;
    balanceDue: string;
    status: string;
  }[];
  payments: {
    id: string;
    paymentNumber: string;
    date: string;
    amount: string;
    paymentMode: string;
  }[];
  vendorCredits: {
    id: string;
    creditNumber: string;
    date: string;
    amount: string;
    reason: string;
  }[];
}

// --- Bill ---

export interface BillLine {
  id: string;
  billId: string;
  itemId?: string | null;
  accountId?: string | null;
  taxRateId?: string | null;
  item?: { id: string; name: string; sku: string } | null;
  account?: { id: string; code: string; name: string } | null;
  description: string;
  quantity: string;
  rate: string;
  taxRate: string;
  amount: string;
}

export interface Bill extends OrgSoftDeleteEntity {
  billNumber: string;
  vendorId: string;
  vendor?: {
    id: string;
    name: string;
    currency: string;
  };
  date: string;
  billDate?: string | null;
  dueDate: string;
  status: BillStatus;
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
  total?: string | null;
  balanceDue: string;
  currencyCode?: string | null;
  exchangeRate?: string | null;
  reference?: string | null;
  notes: string | null;
  projectId: string | null;
  project?: { id: string; name: string } | null;
  lines: BillLine[];
}

export interface CreateBillRequest {
  vendorId: string;
  date: string;
  dueDate: string;
  lines: {
    itemId?: string | null;
    accountId?: string | null;
    description: string;
    quantity: number | string;
    rate: number | string;
    taxRate?: number | string;
  }[];
  notes?: string | null;
  projectId?: string | null;
  reference?: string;
}

export interface UpdateBillRequest extends Partial<CreateBillRequest> {}

export interface BillQuery extends PaginationQuery {
  vendorId?: string;
  status?: BillStatus;
  startDate?: string;
  endDate?: string;
  dateFrom?: string;
  dateTo?: string;
}

// --- Expense ---

export interface Expense extends OrgSoftDeleteEntity {
  date: string;
  accountId: string;
  account?: { id: string; code: string; name: string };
  vendorId: string | null;
  vendor?: { id: string; name: string } | null;
  amount: string;
  taxAmount: string;
  taxInclusive: boolean;
  paidThroughAccountId: string;
  paidThroughAccount?: { id: string; code: string; name: string };
  description: string | null;
  reference: string | null;
  receiptUrl: string | null;
  status: ExpenseStatus;
  projectId: string | null;
  project?: { id: string; name: string } | null;
}

export interface CreateExpenseRequest {
  date: string;
  accountId: string;
  vendorId?: string | null;
  amount: number | string;
  taxAmount?: number | string;
  taxInclusive?: boolean;
  paidThroughAccountId: string;
  description?: string | null;
  reference?: string | null;
  projectId?: string | null;
}

export interface UpdateExpenseRequest extends Partial<CreateExpenseRequest> {}

export interface ExpenseQuery extends PaginationQuery {
  vendorId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

// --- Vendor Credit ---

export interface VendorCredit extends OrgSoftDeleteEntity {
  creditNumber: string;
  vendorId: string;
  vendor?: Vendor;
  billId: string;
  bill?: Bill;
  date: string;
  reason: string;
  amount: string;
  appliedToBillId?: string | null;
  refundedAt?: string | null;
}

export interface CreateVendorCreditRequest {
  vendorId: string;
  billId: string;
  date: string;
  reason: string;
  amount: string;
  appliedToBillId?: string;
}

// --- Payment Made ---

export interface BillAllocation {
  id?: string;
  paymentId?: string;
  billId: string;
  amount: string;
  bill?: {
    id: string;
    billNumber: string;
    date: string;
    dueDate: string;
    grandTotal: string;
    balanceDue: string;
    vendor?: { name: string };
  };
}

export interface PaymentMade extends OrgSoftDeleteEntity {
  paymentNumber: string;
  vendorId: string;
  vendor?: {
    id: string;
    name: string;
    email: string | null;
    currency: string;
  };
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  paidFromAccountId: string;
  paidFromAccount?: { id: string; name: string; code: string };
  reference: string | null;
  notes: string | null;
  allocations?: BillAllocation[];
}

export interface CreatePaymentMadeRequest {
  vendorId: string;
  date: string;
  amount: number | string;
  paymentMode: PaymentMode | string;
  paidFromAccountId: string;
  reference?: string;
  notes?: string;
  allocations?: { billId: string; amount: number | string }[];
}

export interface PaymentMadeQuery extends PaginationQuery {
  vendorId?: string;
  startDate?: string;
  endDate?: string;
}

// --- Duplicate Bill Check ---

export interface DuplicateBillMatch {
  billId: string;
  billNumber: string;
  /** YYYY-MM-DD */
  documentDate: string;
  /** Fixed 4-dp decimal string. */
  amount: string;
  currency: string;
}

export interface DuplicateCheckResult {
  status: 'none' | 'possible' | 'unknown';
  matches: DuplicateBillMatch[];
}

/** Unsaved bill fields to check, e.g. a completed intake; missing fields give "unknown". */
export interface PossibleDuplicateDraft {
  vendorId?: string;
  vendorName?: string;
  /** Exact decimal string. */
  amount?: string;
  /** YYYY-MM-DD */
  date?: string;
  currency?: string;
}
