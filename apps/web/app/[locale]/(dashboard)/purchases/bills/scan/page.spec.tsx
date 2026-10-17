/**
 * Scan bill Review step: when the account or item lookup fails, the page says
 * so (not "Failed to create the bill") and Retry refetches only what failed (#216).
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      has: () => false,
    }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const scanResult = {
  documentType: 'BILL',
  classificationConfidence: 0.9,
  extractedFields: {
    date: '2026-09-01',
    dueDate: '2026-10-01',
    total: 100,
    subtotal: 100,
    tax: 0,
    discount: null,
    documentNumber: 'SCAN-1',
    vendorName: 'Vendor',
    vendorTaxId: null,
    currency: null,
    paymentTerms: null,
    customerName: null,
    lineItems: [{ description: 'Paper', quantity: 1, unitPrice: 100, amount: 100 }],
  },
  fieldConfidence: {},
  ocrConfidence: 0.9,
  matchedVendor: null,
  vendorCandidates: [],
  matchedCustomer: null,
  customerCandidates: [],
  duplicateWarning: null,
  rawText: '',
};

jest.mock('@/lib/hooks/use-ai-document-intake', () => ({
  useDocumentIntakeStream: () => ({
    processDocument: jest.fn().mockResolvedValue(undefined),
    stage: null,
    progress: 100,
    message: null,
    result: scanResult,
    error: null,
    isProcessing: false,
    isReconnecting: false,
    jobId: 'job-1',
    jobStatus: null,
    isDuplicate: false,
    existingDraft: null,
    canRetry: false,
    retry: jest.fn(),
    reset: jest.fn(),
  }),
  useDocumentIntakeConfirm: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/lib/hooks/use-vendors', () => ({
  useCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendors: () => ({ data: { data: [] } }),
}));

const refetchAccounts = jest.fn();
const refetchItems = jest.fn();
const mockUseAccounts = jest.fn();
const mockUseItems = jest.fn();
jest.mock('@/lib/hooks/use-accounts', () => ({
  useAccounts: () => mockUseAccounts(),
}));
jest.mock('@/lib/hooks/use-items', () => ({
  useItems: () => mockUseItems(),
}));

import ScanBillPage from './page';

async function openReviewStep(): Promise<void> {
  render(<ScanBillPage />);
  const file = new File(['%PDF-1.4'], 'bill.pdf', { type: 'application/pdf' });
  fireEvent.drop(screen.getByText('dropHint').closest('div.border-2')!, {
    dataTransfer: { files: [file] },
  });
  fireEvent.click(await screen.findByRole('button', { name: /processWithAi/ }));
  await screen.findByText('resultsTitle');
}

describe('ScanBillPage options lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseItems.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: refetchItems,
    });
  });

  it('shows the lookup error with Retry, and Retry refetches the failed accounts', async () => {
    mockUseAccounts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchAccounts,
    });
    await openReviewStep();

    expect(screen.getByText('optionsLoadFailed')).toBeInTheDocument();
    expect(screen.queryByText('createFailed')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="lines.0.quantity"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(refetchAccounts).toHaveBeenCalledTimes(1);
    expect(refetchItems).not.toHaveBeenCalled();
  });

  it('shows the loading hint while accounts load', async () => {
    mockUseAccounts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: refetchAccounts,
    });
    await openReviewStep();

    expect(screen.getByText('optionsLoading')).toBeInTheDocument();
    expect(screen.queryByText('optionsLoadFailed')).not.toBeInTheDocument();
  });
});
