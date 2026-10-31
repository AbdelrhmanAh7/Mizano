import api from '@/lib/api';

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

// ============ API Functions ============

/** Language of a generated document; Arabic renders right-to-left. */
export type DocumentLocale = 'en' | 'ar';

export function documentLocaleFor(appLocale: string): DocumentLocale {
  return appLocale === 'ar' ? 'ar' : 'en';
}

const documentsApi = {
  // Invoice PDFs
  getInvoicePdf: async (invoiceId: string, locale?: DocumentLocale): Promise<Blob> => {
    const response = await api.get(`/documents/invoice/${invoiceId}/pdf`, {
      params: locale ? { locale } : undefined,
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

// ============ Invoice PDF actions ============

function pdfBlob(data: Blob): Blob {
  return data.type === 'application/pdf' ? data : new Blob([data], { type: 'application/pdf' });
}

/** Downloads the invoice PDF (GET /documents/invoice/:id/pdf, `sales.view`) as `<number>.pdf`. */
export async function downloadInvoicePdf(
  invoiceId: string,
  invoiceNumber: string,
  locale: DocumentLocale,
): Promise<void> {
  const blob = pdfBlob(await documentsApi.getInvoicePdf(invoiceId, locale));
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // Keep the number readable (Arabic too); drop only characters file systems refuse.
  link.download = `${invoiceNumber.replace(/[\\/:*?"<>|\s]+/g, '_') || 'invoice'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Opens the invoice PDF in a new tab for printing. The tab must be opened synchronously in the
 * click handler (popup blockers allow nothing later), so call this directly from onClick; it
 * closes the tab again if the PDF cannot be generated.
 */
export async function openInvoicePdfForPrint(
  invoiceId: string,
  locale: DocumentLocale,
): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const blob = pdfBlob(await documentsApi.getInvoicePdf(invoiceId, locale));
    const url = window.URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    // The viewer has loaded the bytes long before this; keep the URL alive for its own save.
    window.setTimeout(() => window.URL.revokeObjectURL(url), 5 * 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
