import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type DocumentType =
  | 'INVOICE'
  | 'QUOTE'
  | 'CREDIT_NOTE'
  | 'BILL'
  | 'PAYSLIP'
  | 'STATEMENT'
  | 'PURCHASE_ORDER'
  | 'DELIVERY_CHALLAN';

export interface SendDocumentDto {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  message?: string;
  attachPdf?: boolean;
}

export interface SendPayslipsDto {
  subjectTemplate?: string;
  messageTemplate?: string;
}

export interface StatementQueryDto {
  dateFrom: string;
  dateTo: string;
}

export interface SendResult {
  success: boolean;
  emailLogId?: string;
  error?: string;
}

export interface BulkSendResult {
  total: number;
  sent: number;
  failed: number;
  errors: Array<{ employeeId: string; error: string }>;
}

export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  entityType: string;
  entityId: string;
  sentAt: string;
  status: 'sent' | 'failed' | 'bounced';
  error?: string;
}

// ============ API Functions ============

const documentsApi = {
  // Invoice PDFs
  getInvoicePdf: async (invoiceId: string) => {
    const response = await api.get(`/documents/invoice/${invoiceId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },
  sendInvoice: async (invoiceId: string, data: SendDocumentDto) => {
    const response = await api.post(`/documents/invoice/${invoiceId}/send`, data);
    return response.data;
  },

  // Quote PDFs
  getQuotePdf: async (quoteId: string) => {
    const response = await api.get(`/documents/quote/${quoteId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },
  sendQuote: async (quoteId: string, data: SendDocumentDto) => {
    const response = await api.post(`/documents/quote/${quoteId}/send`, data);
    return response.data;
  },

  // Credit Note PDFs
  getCreditNotePdf: async (creditNoteId: string) => {
    const response = await api.get(`/documents/credit-note/${creditNoteId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },
  sendCreditNote: async (creditNoteId: string, data: SendDocumentDto) => {
    const response = await api.post(`/documents/credit-note/${creditNoteId}/send`, data);
    return response.data;
  },

  // Bill PDFs
  getBillPdf: async (billId: string) => {
    const response = await api.get(`/documents/bill/${billId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Payslip PDFs
  getPayslipPdf: async (payslipId: string) => {
    const response = await api.get(`/documents/payslip/${payslipId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },
  sendPayslip: async (payslipId: string, data?: Partial<SendDocumentDto>) => {
    const response = await api.post(`/documents/payslip/${payslipId}/send`, data);
    return response.data;
  },
  sendAllPayslips: async (payrollRunId: string, options?: SendPayslipsDto) => {
    const response = await api.post(`/documents/payroll-run/${payrollRunId}/send-all`, options);
    return response.data;
  },

  // Customer Statement
  getStatementPdf: async (customerId: string, params: StatementQueryDto) => {
    const response = await api.get(`/documents/statement/${customerId}/pdf`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
  sendStatement: async (customerId: string, params: StatementQueryDto & SendDocumentDto) => {
    const response = await api.post(`/documents/statement/${customerId}/send`, params);
    return response.data;
  },

  // Purchase Order PDFs
  getPurchaseOrderPdf: async (poId: string) => {
    const response = await api.get(`/documents/purchase-order/${poId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },
  sendPurchaseOrder: async (poId: string, data: SendDocumentDto) => {
    const response = await api.post(`/documents/purchase-order/${poId}/send`, data);
    return response.data;
  },

  // Delivery Challan PDFs
  getDeliveryChallanPdf: async (challanId: string) => {
    const response = await api.get(`/documents/delivery-challan/${challanId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Email Logs
  getEmailLogs: async (params?: {
    entityType?: string;
    entityId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/documents/email-logs', { params });
    return response.data;
  },
};

// ============ Hooks - Invoice ============

export function useInvoicePdf(invoiceId: string) {
  return useQuery({
    queryKey: ['invoice-pdf', invoiceId],
    queryFn: () => documentsApi.getInvoicePdf(invoiceId),
    enabled: !!invoiceId,
    staleTime: 0, // Always fetch fresh PDF
  });
}

export function useSendInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, data }: { invoiceId: string; data: SendDocumentDto }) =>
      documentsApi.sendInvoice(invoiceId, data),
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    },
  });
}

// ============ Hooks - Quote ============

export function useQuotePdf(quoteId: string) {
  return useQuery({
    queryKey: ['quote-pdf', quoteId],
    queryFn: () => documentsApi.getQuotePdf(quoteId),
    enabled: !!quoteId,
    staleTime: 0,
  });
}

export function useSendQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quoteId, data }: { quoteId: string; data: SendDocumentDto }) =>
      documentsApi.sendQuote(quoteId, data),
    onSuccess: (_, { quoteId }) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', quoteId] });
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    },
  });
}

// ============ Hooks - Credit Note ============

export function useCreditNotePdf(creditNoteId: string) {
  return useQuery({
    queryKey: ['credit-note-pdf', creditNoteId],
    queryFn: () => documentsApi.getCreditNotePdf(creditNoteId),
    enabled: !!creditNoteId,
    staleTime: 0,
  });
}

export function useSendCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ creditNoteId, data }: { creditNoteId: string; data: SendDocumentDto }) =>
      documentsApi.sendCreditNote(creditNoteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    },
  });
}

// ============ Hooks - Bill ============

export function useBillPdf(billId: string) {
  return useQuery({
    queryKey: ['bill-pdf', billId],
    queryFn: () => documentsApi.getBillPdf(billId),
    enabled: !!billId,
    staleTime: 0,
  });
}

// ============ Hooks - Payslip ============

export function usePayslipPdf(payslipId: string) {
  return useQuery({
    queryKey: ['payslip-pdf', payslipId],
    queryFn: () => documentsApi.getPayslipPdf(payslipId),
    enabled: !!payslipId,
    staleTime: 0,
  });
}

export function useSendPayslip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payslipId, data }: { payslipId: string; data?: Partial<SendDocumentDto> }) =>
      documentsApi.sendPayslip(payslipId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    },
  });
}

export function useSendAllPayslips() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payrollRunId, options }: { payrollRunId: string; options?: SendPayslipsDto }) =>
      documentsApi.sendAllPayslips(payrollRunId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    },
  });
}

// ============ Hooks - Statement ============

export function useStatementPdf(customerId: string, params: StatementQueryDto) {
  return useQuery({
    queryKey: ['statement-pdf', customerId, params],
    queryFn: () => documentsApi.getStatementPdf(customerId, params),
    enabled: !!customerId && !!params.dateFrom && !!params.dateTo,
    staleTime: 0,
  });
}

export function useSendStatement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, params }: { customerId: string; params: StatementQueryDto & SendDocumentDto }) =>
      documentsApi.sendStatement(customerId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    },
  });
}

// ============ Hooks - Purchase Order ============

export function usePurchaseOrderPdf(poId: string) {
  return useQuery({
    queryKey: ['purchase-order-pdf', poId],
    queryFn: () => documentsApi.getPurchaseOrderPdf(poId),
    enabled: !!poId,
    staleTime: 0,
  });
}

export function useSendPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, data }: { poId: string; data: SendDocumentDto }) =>
      documentsApi.sendPurchaseOrder(poId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    },
  });
}

// ============ Hooks - Delivery Challan ============

export function useDeliveryChallanPdf(challanId: string) {
  return useQuery({
    queryKey: ['delivery-challan-pdf', challanId],
    queryFn: () => documentsApi.getDeliveryChallanPdf(challanId),
    enabled: !!challanId,
    staleTime: 0,
  });
}

// ============ Hooks - Email Logs ============

export function useEmailLogs(params?: {
  entityType?: string;
  entityId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['email-logs', params],
    queryFn: () => documentsApi.getEmailLogs(params),
  });
}

// ============ Helper Functions ============

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function openBlobInNewTab(blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export function getDocumentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    INVOICE: 'Invoice',
    QUOTE: 'Quote',
    CREDIT_NOTE: 'Credit Note',
    BILL: 'Bill',
    PAYSLIP: 'Payslip',
    STATEMENT: 'Statement',
    PURCHASE_ORDER: 'Purchase Order',
    DELIVERY_CHALLAN: 'Delivery Challan',
  };
  return labels[type] || type;
}

export function getDocumentTypeIcon(type: DocumentType): string {
  const icons: Record<DocumentType, string> = {
    INVOICE: '📄',
    QUOTE: '📋',
    CREDIT_NOTE: '💰',
    BILL: '🧾',
    PAYSLIP: '💵',
    STATEMENT: '📊',
    PURCHASE_ORDER: '📦',
    DELIVERY_CHALLAN: '🚚',
  };
  return icons[type] || '📄';
}

export function getEmailStatusColor(status: string): string {
  const colors: Record<string, string> = {
    sent: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    bounced: 'bg-yellow-100 text-yellow-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}
