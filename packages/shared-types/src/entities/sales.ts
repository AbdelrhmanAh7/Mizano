// ============================================
// Sales Types - Customers, Quotes, Invoices, Credit Notes,
// Payments Received, Delivery Challans
// ============================================

import {
  QuoteStatus,
  InvoiceStatus,
  CreditNoteType,
  PaymentMode,
  ChallanType,
  ChallanStatus,
} from '../enums';
import { Address, OrgSoftDeleteEntity, PaginationQuery } from './base';

// --- Customer ---

export interface Customer extends OrgSoftDeleteEntity {
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  taxId: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  creditLimit?: string | null;
  billingStreet: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  shippingStreet: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  paymentTerms: number;
  priceListId: string | null;
  outstandingBalance?: string;
}

export interface CreateCustomerRequest {
  name: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  taxId?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  paymentTerms?: number;
  priceListId?: string;
}

export interface UpdateCustomerRequest extends Partial<CreateCustomerRequest> {}

export interface CustomerQuery extends PaginationQuery {}

export interface CustomerStatement {
  customer: Customer;
  invoices: {
    id: string;
    invoiceNumber: string;
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
  creditNotes: {
    id: string;
    creditNoteNumber: string;
    date: string;
    amount: string;
    type: string;
  }[];
}

// --- Quote ---

export interface QuoteLine {
  id: string;
  quoteId: string;
  itemId?: string | null;
  item?: { id: string; name: string; sku: string };
  description: string;
  quantity: string;
  rate: string;
  discount: string;
  taxRate: string;
  amount: string;
}

export interface Quote extends OrgSoftDeleteEntity {
  quoteNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    displayName?: string | null;
    email: string | null;
    currency?: string;
  };
  date: string;
  expiryDate: string;
  status: QuoteStatus;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  grandTotal: string;
  currencyCode?: string | null;
  notes: string | null;
  terms: string | null;
  lines: QuoteLine[];
}

export interface CreateQuoteRequest {
  customerId: string;
  date: string;
  expiryDate: string;
  lines: {
    itemId?: string;
    description: string;
    quantity: string;
    rate: string;
    discount?: string;
    taxRate?: string;
  }[];
  notes?: string;
  terms?: string;
}

export interface UpdateQuoteRequest extends Partial<CreateQuoteRequest> {}

export interface QuoteQuery extends PaginationQuery {
  status?: QuoteStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// --- Invoice ---

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  itemId?: string | null;
  taxRateId?: string | null;
  item?: { id: string; name: string; sku: string };
  description: string;
  quantity: string;
  rate: string;
  unitPrice?: string | null;
  discount: string;
  taxRate: string;
  amount: string;
  sortOrder: number;
}

export interface Invoice extends OrgSoftDeleteEntity {
  invoiceNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email: string | null;
  };
  quoteId?: string | null;
  projectId?: string | null;
  date: string;
  issueDate?: string | null;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  shippingAmount: string;
  grandTotal: string;
  total?: string | null;
  balanceDue: string;
  currencyCode?: string | null;
  exchangeRate?: string | null;
  notes: string | null;
  terms: string | null;
  lines: InvoiceLine[];
  payments?: {
    id: string;
    paymentNumber: string;
    date: string;
    amount: string;
  }[];
}

export interface CreateInvoiceRequest {
  customerId: string;
  quoteId?: string;
  projectId?: string;
  date: string;
  dueDate: string;
  lines: {
    itemId?: string;
    description: string;
    quantity: string;
    rate: string;
    discount?: string;
    taxRate?: string;
    taxRateId?: string;
  }[];
  shippingAmount?: string;
  notes?: string;
  terms?: string;
}

export interface UpdateInvoiceRequest extends Partial<CreateInvoiceRequest> {}

export interface InvoiceQuery extends PaginationQuery {
  status?: InvoiceStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// --- Credit Note ---

export interface CreditNote extends OrgSoftDeleteEntity {
  creditNoteNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email: string | null;
  };
  invoiceId: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    grandTotal: string;
  };
  date: string;
  issueDate?: string | null;
  reason: string;
  amount: string;
  total?: string | null;
  type: CreditNoteType;
  appliedToInvoiceId?: string | null;
  appliedToInvoice?: {
    id: string;
    invoiceNumber: string;
  };
  refundedAt?: string | null;
}

export interface CreateCreditNoteRequest {
  customerId: string;
  invoiceId: string;
  date: string;
  type: CreditNoteType;
  amount: string;
  reason?: string;
  appliedToInvoiceId?: string;
}

export interface CreditNoteQuery extends PaginationQuery {
  customerId?: string;
  invoiceId?: string;
  type?: CreditNoteType;
  dateFrom?: string;
  dateTo?: string;
}

// --- Payment Received ---

export interface PaymentAllocation {
  id?: string;
  paymentId?: string;
  invoiceId: string;
  amount: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    grandTotal: string;
    balanceDue: string;
  };
}

export interface PaymentReceived extends OrgSoftDeleteEntity {
  paymentNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email: string | null;
  };
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  depositToAccountId: string;
  depositToAccount?: {
    id: string;
    name: string;
    code: string;
  };
  reference: string | null;
  notes: string | null;
  allocations: PaymentAllocation[];
}

export interface CreatePaymentReceivedRequest {
  customerId: string;
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  depositToAccountId: string;
  reference?: string;
  notes?: string;
  allocations: { invoiceId: string; amount: string }[];
}

export interface PaymentReceivedQuery extends PaginationQuery {
  customerId?: string;
  paymentMode?: PaymentMode;
  dateFrom?: string;
  dateTo?: string;
}

// --- Delivery Challan ---

export interface DeliveryChallanLine {
  id?: string;
  challanId?: string;
  itemId: string;
  item?: {
    id: string;
    name: string;
    sku?: string;
    unit?: string;
  };
  quantity: number;
  description?: string | null;
  warehouseId?: string | null;
  warehouse?: {
    id: string;
    name: string;
  };
}

export interface DeliveryChallan extends OrgSoftDeleteEntity {
  challanNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  invoiceId?: string | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    date: string;
    grandTotal: string;
  };
  challanType: ChallanType;
  date: string;
  status: ChallanStatus;
  notes?: string | null;
  lines: DeliveryChallanLine[];
}

export interface CreateDeliveryChallanRequest {
  customerId: string;
  invoiceId?: string;
  challanType: ChallanType;
  date: string;
  notes?: string;
  lines: {
    itemId: string;
    quantity: number;
    description?: string;
    warehouseId?: string;
  }[];
}

export interface UpdateDeliveryChallanRequest {
  customerId?: string;
  challanType?: ChallanType;
  date?: string;
  notes?: string;
  lines?: {
    id?: string;
    itemId: string;
    quantity: number;
    description?: string;
    warehouseId?: string;
  }[];
}

export interface DeliveryChallanQuery extends PaginationQuery {
  status?: ChallanStatus;
  challanType?: ChallanType;
  customerId?: string;
  invoiceId?: string;
  dateFrom?: string;
  dateTo?: string;
}
