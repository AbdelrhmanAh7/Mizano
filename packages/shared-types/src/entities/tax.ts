// ============================================
// Tax Types - Tax Rates, VAT Returns, VAT Payments
// ============================================

import { TaxType, VATReturnStatus } from '../enums';
import { OrganizationEntity } from './base';

// --- Tax Rate ---

export interface TaxRate extends OrganizationEntity {
  name: string;
  code?: string | null;
  description?: string | null;
  rate: string;
  type: TaxType;
  linkedAccountId?: string | null;
  collectAccountId?: string | null;
  account?: { id: string; name: string; code: string };
  isDefault: boolean;
  isActive: boolean;
}

export interface CreateTaxRateRequest {
  name: string;
  code?: string;
  description?: string;
  rate: string | number;
  type: TaxType;
  linkedAccountId?: string;
  collectAccountId?: string;
  isDefault?: boolean;
}

export interface UpdateTaxRateRequest extends Partial<CreateTaxRateRequest> {
  isActive?: boolean;
}

// --- VAT Return ---

export interface VATReturn extends OrganizationEntity {
  returnNumber?: string | null;
  period: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  startDate: string;
  endDate: string;
  dueDate?: string | null;
  status: VATReturnStatus;
  totalSales: string;
  outputVAT: string;
  totalPurchases: string;
  inputVAT: string;
  netPayable: string;
  filedAt?: string | null;
  submittedAt?: string | null;
  payment?: VATPayment;
}

export interface CreateVATReturnRequest {
  period: string;
  startDate: string;
  endDate: string;
}

// --- VAT Payment ---

export interface VATPayment extends OrganizationEntity {
  vatReturnId: string;
  date: string;
  amount: string;
  paidFromAccountId: string;
  paidFromAccount?: { id: string; name: string };
  reference?: string | null;
}

export interface CreateVATPaymentRequest {
  vatReturnId: string;
  date: string;
  amount: string;
  paidFromAccountId: string;
  reference?: string;
}

// --- Exchange Rate ---

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  date: string;
  source: string;
  organizationId: string;
  createdAt: string;
}

export interface CreateExchangeRateRequest {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;
  source?: string;
}

export interface ExchangeRateQuery {
  fromCurrency?: string;
  toCurrency?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface ConvertAmountRequest {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}

export interface ConvertAmountResult {
  originalAmount: number;
  convertedAmount: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateDate: string;
  rateSource: string;
}
