import React from 'react';
import { render, screen } from '@testing-library/react';
import type { DocumentIntakeResult } from '@/lib/hooks/use-ai-document-intake';
import ScanBillPage from './page';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Scan Bill',
      subtitle: 'Upload a document',
      uploadTitle: 'Upload Document',
      dropHint: 'Drop your document here or click to browse',
      supportsHint: 'Supports images and PDF',
      processWithAi: 'Scan',
      'steps.upload': 'Upload',
      'steps.processing': 'Processing',
      'steps.review': 'Review',
      'steps.done': 'Done',
      resultsTitle: 'AI Extraction Results',
    };
    return translations[key] || key;
  },
}));

jest.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: jest.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockIntakeStream: {
  processDocument: jest.Mock;
  stage: string | null;
  progress: number;
  message: string | null;
  result: DocumentIntakeResult | null;
  error: string | null;
  isProcessing: boolean;
  isReconnecting: boolean;
  jobId: string | null;
  jobStatus: string | null;
  isDuplicate: boolean;
  existingDraft: { type: string; id: string } | null;
  canRetry: boolean;
  retry: jest.Mock;
  reset: jest.Mock;
} = {
  processDocument: jest.fn(),
  stage: null,
  progress: 0,
  message: null,
  result: null,
  error: null,
  isProcessing: false,
  isReconnecting: false,
  jobId: null,
  jobStatus: null,
  isDuplicate: false,
  existingDraft: null,
  canRetry: false,
  retry: jest.fn(),
  reset: jest.fn(),
};

jest.mock('@/lib/hooks/use-ai-document-intake', () => ({
  useDocumentIntakeStream: () => mockIntakeStream,
  useDocumentIntakeConfirm: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/lib/hooks/use-vendors', () => ({
  useCreateVendor: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/components/purchases/bill-form', () => ({
  BillForm: () => <div data-testid="bill-form">BillForm</div>,
}));

describe('ScanBillPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIntakeStream.stage = null;
    mockIntakeStream.result = null;
    mockIntakeStream.isProcessing = false;
  });

  it('renders a file input with aria-label "Select file" and a "Select file" button', () => {
    render(<ScanBillPage />);

    const fileInput = screen.getByLabelText('Select file');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');

    const selectFileBtn = screen.getByRole('button', { name: /select file/i });
    expect(selectFileBtn).toBeInTheDocument();
  });

  it('renders a Scan button for processing', () => {
    render(<ScanBillPage />);

    const scanBtn = screen.getByRole('button', { name: /scan/i });
    expect(scanBtn).toBeInTheDocument();
  });

  it('displays Completed badge and status when extraction completes into review', async () => {
    mockIntakeStream.result = {
      documentType: 'BILL',
      classificationConfidence: 0.95,
      extractedFields: {
        date: '2026-10-19',
        dueDate: '2026-11-19',
        total: '100.00',
        subtotal: '86.96',
        tax: '13.04',
        discount: '0.00',
        documentNumber: 'INV-001',
        vendorName: 'Acme Corp',
        vendorTaxId: '123456789',
        currency: 'USD',
        paymentTerms: 'Net 30',
        customerName: null,
        lineItems: [],
      },
      fieldConfidence: {},
      ocrConfidence: 0.98,
      matchedVendor: null,
      vendorCandidates: [],
      matchedCustomer: null,
      customerCandidates: [],
      duplicateWarning: null,
      rawText: 'INV-001',
    };

    const { rerender } = render(<ScanBillPage />);

    // Upload a file
    const file = new File(['invoice content'], 'invoice.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Select file');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { files: [file] } });

    // Click Scan
    const scanBtn = screen.getByRole('button', { name: /scan/i });
    expect(scanBtn).not.toBeDisabled();
    fireEvent.click(scanBtn);

    // Re-render to process state update
    rerender(<ScanBillPage />);

    // In review step, 'Completed' text and badge must be visible
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('status-completed')).toHaveTextContent('Completed');
  });
});
