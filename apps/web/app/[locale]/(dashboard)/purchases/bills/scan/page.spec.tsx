import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { BillFormDefaultValues } from '@/components/purchases/bill-form';
import type { DocumentIntakeResult } from '@/lib/hooks/use-ai-document-intake';
import en from '@/messages/en/ai.json';
import ar from '@/messages/ar/ai.json';

const mockLoadJob = jest.fn();
const mockReset = jest.fn();
const mockRetry = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockConfirm = jest.fn();
const mockCreateVendor = jest.fn();
let mockQuery = new URLSearchParams('jobId=telegram_1');
let mockLocale: 'en' | 'ar' = 'en';
const mockTranslate = (key: string, values?: Record<string, string | number>): string => {
  let message: unknown = (mockLocale === 'ar' ? ar : en).intake;
  for (const part of key.split('.')) message = (message as Record<string, unknown>)[part];
  if (typeof message !== 'string') throw new Error(`Missing translation: ${key}`);
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ''));
};
const mockIntake = {
  loadJob: mockLoadJob,
  reset: mockReset,
  retry: mockRetry,
  result: null as DocumentIntakeResult | null,
  existingDraft: null as { type: string; id: string } | null,
  error: null as string | null,
  isEmpty: false,
  jobId: 'telegram_1',
  jobStatus: 'EXTRACTED',
  stage: 'complete',
  progress: 100,
  message: null as string | null,
  isReconnecting: false,
  canRetry: false,
  isDuplicate: false,
};
const extracted: DocumentIntakeResult = {
  documentType: 'BILL',
  classificationConfidence: 0.9,
  fieldConfidence: {},
  ocrConfidence: 0.9,
  vendorCandidates: [],
  matchedVendor: { id: 'vendor_1', name: 'Vendor', similarity: 0.9 },
  matchedCustomer: null,
  customerCandidates: [],
  duplicateWarning: null,
  rawText: '',
  extractedFields: {
    date: '2026-10-01',
    dueDate: '2026-10-31',
    documentNumber: 'REF-1',
    currency: 'EGP',
    subtotal: 100,
    tax: 14,
    total: 114,
    discount: null,
    vendorName: 'Vendor',
    vendorTaxId: null,
    customerName: null,
    paymentTerms: null,
    lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, taxAmount: 14, total: 114 }],
  },
};
let mockFormData: Record<string, unknown>;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockQuery,
}));
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) =>
    namespace === 'ai.intake.scan'
      ? (key: string, values?: Record<string, string | number>) =>
          mockTranslate(`scan.${key}`, values)
      : mockTranslate,
  useLocale: () => mockLocale,
}));
jest.mock('@/lib/hooks/use-ai-document-intake', () => ({
  useDocumentIntakeStream: () => mockIntake,
  useDocumentIntakeConfirm: () => ({ mutateAsync: mockConfirm }),
}));
jest.mock('@/lib/hooks/use-vendors', () => ({
  useCreateVendor: () => ({ mutateAsync: mockCreateVendor }),
}));
jest.mock('@/components/purchases/bill-form', () => ({
  BillForm: ({
    scanDefaults,
    extractedTotals,
    onCancel,
    onSubmit,
  }: {
    scanDefaults: BillFormDefaultValues;
    extractedTotals: {
      subtotal: number | null;
      tax: number | null;
      total: number | null;
      discount: number | null;
    };
    onCancel: () => void;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
  }) => (
    <div>
      <div data-testid="draft">{JSON.stringify(scanDefaults)}</div>
      <div data-testid="extracted-totals">{JSON.stringify(extractedTotals)}</div>
      <button onClick={onCancel}>Cancel review</button>
      <button onClick={() => void onSubmit(mockFormData)}>Submit review</button>
    </div>
  ),
}));
import ScanBillPage from './page';

describe('scan job deep link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = new URLSearchParams('jobId=telegram_1');
    mockLocale = 'en';
    Object.assign(mockIntake, {
      result: null,
      error: null,
      isEmpty: false,
      jobId: 'telegram_1',
      existingDraft: null,
      canRetry: false,
      progress: 100,
      message: null,
      isReconnecting: false,
    });
    mockConfirm.mockResolvedValue({ data: { id: 'bill_1' } });
    mockFormData = {
      vendorId: 'vendor_1',
      date: '2026-10-01',
      dueDate: '2026-10-31',
      currencyCode: 'EGP',
      lines: [{ description: 'Item', quantity: '1', rate: '999999999999999.9999', taxRate: '14' }],
    };
  });
  it.each(['en', 'ar'] as const)('loads the URL job with localized loading in %s', (locale) => {
    mockLocale = locale;
    mockIntake.message = mockTranslate('jobLoading');
    render(<ScanBillPage />);
    expect(mockLoadJob).toHaveBeenCalledWith('telegram_1');
    expect(screen.getAllByText(mockTranslate('jobLoading'))).toHaveLength(2);
    expect(screen.queryByText(mockTranslate('uploadTitle'))).not.toBeInTheDocument();
  });
  it.each(['en', 'ar'] as const)(
    'preloads draft defaults and preserves %s on cancel',
    async (locale) => {
      mockLocale = locale;
      mockIntake.result = extracted;
      render(<ScanBillPage />);
      const draft = await screen.findByTestId('draft');
      const defaults = JSON.parse(draft.textContent || '{}') as BillFormDefaultValues;
      expect(defaults).toMatchObject({
        vendorId: 'vendor_1',
        reference: 'REF-1',
        currencyCode: 'EGP',
        date: '2026-10-01',
        dueDate: '2026-10-31',
      });
      expect(defaults.lines).toEqual([
        { description: 'Item', quantity: '1', rate: '100', taxRate: '14' },
      ]);
      expect(screen.getByText(`${mockTranslate('financialSummary')} (EGP)`)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel review' }));
      expect(mockReplace).toHaveBeenCalledWith(`/${locale}/purchases/bills/scan`);
    },
  );
  it.each(['en', 'ar'] as const)(
    'offers read-only Retry for an inaccessible job in %s',
    async (locale) => {
      mockLocale = locale;
      mockIntake.error = mockTranslate('jobNotFound');
      render(<ScanBillPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(mockTranslate('jobNotFound'));
      fireEvent.click(screen.getByRole('button', { name: mockTranslate('retry') }));
      expect(mockLoadJob).toHaveBeenCalledTimes(2);
      expect(mockRetry).not.toHaveBeenCalled();
    },
  );
  it('removes the old draft on query change and cancels on unmount', async () => {
    mockIntake.result = extracted;
    const view = render(<ScanBillPage />);
    await screen.findByTestId('draft');
    mockQuery = new URLSearchParams('jobId=telegram_2');
    view.rerender(<ScanBillPage />);
    expect(screen.queryByTestId('draft')).not.toBeInTheDocument();
    expect(mockLoadJob).toHaveBeenLastCalledWith('telegram_2');
    view.unmount();
    expect(mockReset).toHaveBeenCalled();
  });
  it.each(['', 'jobId=', 'jobId=%20'])('keeps upload for query %s', (query) => {
    mockQuery = new URLSearchParams(query);
    render(<ScanBillPage />);
    expect(mockLoadJob).not.toHaveBeenCalled();
    expect(screen.getByText(mockTranslate('uploadTitle'))).toBeInTheDocument();
  });
  it.each(['en', 'ar'] as const)('shows a distinct empty state with Retry in %s', (locale) => {
    mockLocale = locale;
    mockIntake.isEmpty = true;
    render(<ScanBillPage />);
    expect(screen.getByRole('status')).toHaveTextContent(mockTranslate('jobEmpty'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('draft')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: mockTranslate('retry') }));
    expect(mockLoadJob).toHaveBeenCalledTimes(2);
    expect(mockRetry).not.toHaveBeenCalled();
  });
  it('shows progress and localized reconnect state', () => {
    mockIntake.progress = 35;
    mockIntake.isReconnecting = true;
    render(<ScanBillPage />);
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(mockTranslate('reconnecting'));
  });
  it.each(['bill', 'invoice'])(
    'opens an approved %s with a locale and encoded id',
    async (type) => {
      mockLocale = 'ar';
      mockIntake.existingDraft = { type, id: 'draft/1' };
      render(<ScanBillPage />);
      expect(await screen.findByRole('link', { name: mockTranslate('openDraft') })).toHaveAttribute(
        'href',
        type === 'bill' ? '/ar/purchases/bills/draft%2F1' : '/ar/sales/invoices/draft%2F1',
      );
      expect(screen.queryByTestId('draft')).not.toBeInTheDocument();
    },
  );
  it('ignores a previous job error', () => {
    mockIntake.jobId = 'previous';
    mockIntake.error = mockTranslate('jobNotFound');
    render(<ScanBillPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('uses processing Retry for a failed job', async () => {
    mockIntake.canRetry = true;
    mockIntake.error = mockTranslate('jobFailed');
    render(<ScanBillPage />);
    fireEvent.click(await screen.findByRole('button', { name: mockTranslate('retry') }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(mockLoadJob).toHaveBeenCalledTimes(1);
  });
  it('confirms with fixed 4-dp quantity and rate, a bounded tax percentage and the loaded job id', async () => {
    mockIntake.result = extracted;
    render(<ScanBillPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'telegram_1',
          currencyCode: 'EGP',
          lines: [
            expect.objectContaining({
              quantity: '1.0000',
              rate: '999999999999999.9999',
              taxRatePercent: '14',
            }),
          ],
        }),
      ),
    );
  });
  it.each([
    ['14', '14'],
    ['014', '14'],
    ['14.5', '14.5'],
    ['14.25', '14.25'],
    ['0', '0'],
  ])('sends tax percentage %s as %s within the API 2-dp bound', async (taxRate, sent) => {
    mockIntake.result = extracted;
    mockFormData.lines = [{ description: 'Item', quantity: '1', rate: '10', taxRate }];
    render(<ScanBillPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    const payload = mockConfirm.mock.calls[0][0] as { lines: Array<{ taxRatePercent: string }> };
    expect(payload.lines[0].taxRatePercent).toBe(sent);
    // ConfirmIntakeLineDto.taxRatePercent is IsDecimalString(2): a 4-dp value is a 400.
    expect(payload.lines[0].taxRatePercent).toMatch(/^\d{1,15}(\.\d{1,2})?$/);
  });
  it.each(['14.123', '14.0000', '-1', '1e1', '', ' ', 14])(
    'rejects tax percentage %j before mutation with the percentage message',
    async (taxRate) => {
      mockIntake.result = extracted;
      mockFormData.lines = [{ quantity: '1', rate: '10', taxRate }];
      render(<ScanBillPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        mockTranslate('invalidLinePercent', { line: 1 }),
      );
      expect(mockConfirm).not.toHaveBeenCalled();
    },
  );
  it.each(['1000000000000000', '1.00001', '-1', 'NaN', 0.1])(
    'rejects invalid decimal %s before mutation',
    async (rate) => {
      mockIntake.result = extracted;
      mockFormData.lines = [{ quantity: '1', rate, taxRate: '14' }];
      render(<ScanBillPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        mockTranslate('invalidLineDecimal', { line: 1 }),
      );
      expect(mockConfirm).not.toHaveBeenCalled();
    },
  );
  it('requires explicit tax review for uncertain extraction', async () => {
    mockIntake.result = {
      ...extracted,
      extractedFields: {
        ...extracted.extractedFields,
        lineItems: [{ ...extracted.extractedFields.lineItems[0], taxAmount: null }],
        tax: null,
      },
    };
    render(<ScanBillPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(mockTranslate('taxReviewRequired'));
    expect(mockConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
  });
  it('localizes confirmation errors without showing server data', async () => {
    mockIntake.result = extracted;
    mockConfirm.mockRejectedValue(new Error('private document data'));
    render(<ScanBillPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(mockTranslate('confirmFailed'));
    expect(screen.queryByText('private document data')).not.toBeInTheDocument();
  });
  it('passes extracted totals and header discount to the Decimal discrepancy preview', async () => {
    mockIntake.result = {
      ...extracted,
      extractedFields: { ...extracted.extractedFields, tax: 7, total: 107, discount: 10 },
    };
    render(<ScanBillPage />);
    const totals = await screen.findByTestId('extracted-totals');
    expect(JSON.parse(totals.textContent || '{}')).toEqual({
      subtotal: 100,
      tax: 7,
      total: 107,
      discount: 10,
    });
  });
  it.each(['en', 'ar'] as const)(
    'localizes currency mismatch after loading a job in %s',
    async (locale) => {
      mockLocale = locale;
      mockIntake.result = extracted;
      mockConfirm.mockRejectedValue({
        response: {
          data: {
            message:
              'Document currency USD differs from the base currency EGP; foreign-currency documents are not supported yet',
          },
        },
      });
      render(<ScanBillPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        mockTranslate('scan.currencyMismatch'),
      );
      expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'telegram_1' }));
      expect(screen.queryByText(/Document currency USD/)).not.toBeInTheDocument();
    },
  );
  it('keeps unknown API response text out of the localized confirmation error', async () => {
    mockIntake.result = extracted;
    mockConfirm.mockRejectedValue({ response: { data: { message: 'private document data' } } });
    render(<ScanBillPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(mockTranslate('confirmFailed'));
    expect(screen.queryByText('private document data')).not.toBeInTheDocument();
  });
  it('ignores confirmation completion after navigating to another job', async () => {
    let resolve!: (value: unknown) => void;
    mockConfirm.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mockIntake.result = extracted;
    const view = render(<ScanBillPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
    mockQuery = new URLSearchParams('jobId=telegram_2');
    view.rerender(<ScanBillPage />);
    await act(async () => {
      resolve({ data: { id: 'old_bill' } });
    });
    expect(screen.queryByText(mockTranslate('confirmed'))).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
