import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type IntakeDocumentType = 'BILL' | 'INVOICE' | 'RECEIPT' | 'OTHER';

export interface VendorCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface CustomerCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface IntakeLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface DocumentIntakeResult {
  documentType: IntakeDocumentType;
  classificationConfidence: number;
  extractedFields: {
    date: string | null;
    dueDate: string | null;
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    documentNumber: string | null;
    vendorName: string | null;
    customerName: string | null;
    lineItems: IntakeLineItem[];
  };
  fieldConfidence: Record<string, number>;
  ocrConfidence: number;
  matchedVendor: VendorCandidate | null;
  vendorCandidates: VendorCandidate[];
  matchedCustomer: CustomerCandidate | null;
  customerCandidates: CustomerCandidate[];
  duplicateWarning: {
    isDuplicate: boolean;
    existingId: string | null;
    matchType: string;
    similarity: number;
  } | null;
  rawText: string;

  /** Accounting entry suggestion from Ollama */
  accountingEntry?: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  } | null;

  /** Which AI engine was used */
  extractionMethod?: 'ollama-vision' | 'ollama-text';
}

export interface ConfirmIntakeLineData {
  itemId?: string;
  accountId?: string;
  description: string;
  quantity: number;
  rate: number;
  taxRate?: number;
}

export interface ConfirmIntakeData {
  type: 'BILL' | 'INVOICE';
  vendorId?: string;
  customerId?: string;
  date: string;
  dueDate: string;
  documentNumber?: string;
  lines: ConfirmIntakeLineData[];
  notes?: string;
  projectId?: string;
  corrections?: Record<string, unknown>;
}

export interface ConfirmIntakeResponse {
  type: 'bill' | 'invoice';
  id: string;
  number: string;
}

// ============ API Functions ============

const documentIntakeApi = {
  processDocument: async (formData: FormData) => {
    const response = await api.post('/ai/document-intake/process', formData, {
      headers: { 'Content-Type': undefined },
      timeout: 330000, // 5.5 min — must exceed backend Ollama vision timeout (300s)
    });
    return response.data;
  },
  confirmIntake: async (data: ConfirmIntakeData) => {
    const response = await api.post('/ai/document-intake/confirm', data);
    return response.data;
  },
};

// ============ Hooks ============

export function useDocumentIntakeProcess() {
  return useMutation({
    mutationFn: documentIntakeApi.processDocument,
  });
}

export function useDocumentIntakeConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentIntakeApi.confirmIntake,
    onSuccess: (data: { data: ConfirmIntakeResponse }) => {
      const type = data.data.type;
      queryClient.invalidateQueries({ queryKey: [type === 'bill' ? 'bills' : 'invoices'] });
    },
  });
}
