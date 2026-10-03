import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import heic2any from 'heic2any';
import ScanBillPage from '../app/[locale]/(dashboard)/purchases/bills/scan/page';
import { useDocumentIntakeStream, type DocumentIntakeResult } from './hooks/use-ai-document-intake';
import { BillForm } from '../components/purchases/bill-form';
import { INTAKE_MAX_UPLOAD_BYTES } from './document-intake-upload';
import en from '../messages/en/ai.json';
import ar from '../messages/ar/ai.json';

let mockLocale: 'en' | 'ar' = 'en';
const mockConfirm = jest.fn();
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const messages = mockLocale === 'en' ? en : ar;
    return `${namespace.replace(/^ai\./, '')}.${key}`
      .split('.')
      .reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], messages);
  },
}));

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./hooks/use-ai-document-intake', () => ({
  useDocumentIntakeStream: jest.fn(),
  useDocumentIntakeConfirm: () => ({ mutateAsync: mockConfirm }),
}));
jest.mock('./hooks/use-vendors', () => ({ useCreateVendor: () => ({ mutateAsync: jest.fn() }) }));
jest.mock('../components/purchases/bill-form', () => ({ BillForm: jest.fn(() => null) }));

describe('scan upload preserves originals and repairs invalid previews', () => {
  const upload = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    upload.mockClear();
    mockConfirm.mockReset().mockResolvedValue({ data: { id: 'bill_1' } });
    jest.mocked(BillForm).mockClear();
    jest
      .mocked(heic2any)
      .mockReset()
      .mockResolvedValue(new Blob(['jpeg-preview']));
    jest.mocked(useDocumentIntakeStream).mockReturnValue({
      result: null,
      error: null,
      processDocument: upload,
      reset: jest.fn(),
    } as unknown as ReturnType<typeof useDocumentIntakeStream>);
    URL.createObjectURL = jest.fn().mockReturnValue('blob:preview');
    URL.revokeObjectURL = jest.fn();
  });

  function show(locale: 'en' | 'ar' = 'en') {
    mockLocale = locale;
    return render(<ScanBillPage />);
  }
  function prepareButton(): HTMLElement {
    return screen.getByRole('button', {
      name: (mockLocale === 'en' ? en : ar).intake.prepareFields,
    });
  }
  function drop(file: File): void {
    fireEvent.drop(screen.getByText((mockLocale === 'en' ? en : ar).intake.scan.dropHint), {
      dataTransfer: { files: [file] },
    });
  }

  async function review(taxAmount: string): Promise<void> {
    const extracted: DocumentIntakeResult = {
      documentType: 'BILL',
      classificationConfidence: 1,
      extractedFields: {
        date: '2026-10-03',
        dueDate: '2026-11-03',
        total: '228.0000',
        subtotal: '200.0000',
        tax: taxAmount,
        discount: null,
        documentNumber: 'SOURCE-1',
        vendorName: null,
        vendorTaxId: null,
        currency: 'EGP',
        paymentTerms: null,
        customerName: null,
        lineItems: [
          {
            description: 'CPU',
            quantity: '2.0000',
            unitPrice: '100.0000',
            taxAmount,
            total: '200.0000',
          },
        ],
      },
      fieldConfidence: {},
      ocrConfidence: 1,
      matchedVendor: { id: 'vendor_1', name: 'Supplier', similarity: 1 },
      vendorCandidates: [],
      matchedCustomer: null,
      customerCandidates: [],
      duplicateWarning: null,
      rawText: '',
    };
    jest.mocked(useDocumentIntakeStream).mockReturnValue({
      result: extracted,
      error: null,
      processDocument: upload,
      reset: jest.fn(),
      jobId: 'intake_1',
    } as unknown as ReturnType<typeof useDocumentIntakeStream>);
    show();
    drop(new File(['image'], 'source.png', { type: 'image/png' }));
    fireEvent.click(prepareButton());
    await waitFor(() => expect(BillForm).toHaveBeenCalled());
  }

  function reviewedForm(): React.ComponentProps<typeof BillForm> {
    return jest.mocked(BillForm).mock.calls.at(-1)![0];
  }

  it('preserves decimal defaults and sends the reviewed tax percentage after upload', async () => {
    await review('28.0000');
    expect(reviewedForm().scanDefaults?.lines).toEqual([
      { description: 'CPU', quantity: '2.0000', rate: '100.0000', taxRate: '14' },
    ]);
    expect(screen.getByText(en.intake.scan.extractedTax)).toBeInTheDocument();
    expect(screen.getByText(en.intake.scan.extractedTotal)).toBeInTheDocument();
    expect(reviewedForm().extractedTotals).toEqual({
      subtotal: '200.0000',
      tax: '28.0000',
      total: '228.0000',
      discount: null,
    });
    jest.useFakeTimers();
    try {
      await act(async () => {
        reviewedForm().onSubmit({
          ...reviewedForm().scanDefaults,
          lines: [{ description: 'CPU', quantity: '1.3751', rate: '19.9999', taxRate: '14' }],
        });
      });
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          currencyCode: 'EGP',
          jobId: 'intake_1',
          lines: [
            {
              itemId: undefined,
              accountId: undefined,
              description: 'CPU',
              quantity: '1.3751',
              rate: '19.9999',
              taxRatePercent: '14',
            },
          ],
        }),
      );
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('blocks confirmation of unresolved tax until the accountant reviews it', async () => {
    await review('0.0000');
    expect(reviewedForm().scanDefaults?.lines?.[0].taxRate).toBe('');
    await act(async () => {
      reviewedForm().onSubmit({ ...reviewedForm().scanDefaults });
    });
    expect(screen.getByText(en.intake.scan.taxNotReviewed)).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: en.intake.scan.taxReviewedCheckbox }),
    ).not.toBeChecked();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('uses the HEIC original for intake and releases its JPEG preview on unmount', async () => {
    const view = show();
    const original = new File(['original-source'], 'source.heic', { type: 'image/heic' });
    drop(original);
    await waitFor(() => expect(prepareButton()).toBeEnabled());
    fireEvent.click(prepareButton());
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const payload = upload.mock.calls[0][0] as FormData;
    expect(payload.get('file')).toBe(original);
    expect(payload.get('strategy')).toBeNull();
    expect(screen.queryByText(/qwen3|PaddleOCR|Scan Mode:/)).not.toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/jpeg' }),
    );
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it.each(['en', 'ar'] as const)(
    'rejects an oversized file with %s repair before allocating a preview',
    async (locale) => {
      show(locale);
      const oversized = new File(['x'], 'oversized.png', { type: 'image/png' });
      Object.defineProperty(oversized, 'size', { value: INTAKE_MAX_UPLOAD_BYTES + 1 });
      drop(oversized);
      expect(
        await screen.findByText((locale === 'en' ? en : ar).intake.uploadTooLarge),
      ).toBeInTheDocument();
      expect(prepareButton()).toBeDisabled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it.each(['en', 'ar'] as const)(
    'rejects legacy DOC with %s repair before preview or upload',
    async (locale) => {
      show(locale);
      drop(new File(['legacy'], 'source.DOC', { type: 'application/octet-stream' }));
      expect(
        await screen.findByText((locale === 'en' ? en : ar).intake.unsupportedLegacyDoc),
      ).toBeInTheDocument();
      expect(prepareButton()).toBeDisabled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it.each(['en', 'ar'] as const)(
    'shows a localized %s repair when HEIC preview fails',
    async (locale) => {
      jest.mocked(heic2any).mockRejectedValue(new Error('DOCUMENT-SECRET'));
      show(locale);
      drop(new File(['bad-image'], 'source.heic', { type: 'image/heic' }));
      expect(
        await screen.findByText((locale === 'en' ? en : ar).intake.previewFailed),
      ).toBeInTheDocument();
      expect(screen.queryByText(/DOCUMENT-SECRET/)).not.toBeInTheDocument();
      expect(prepareButton()).toBeDisabled();
      expect(upload).not.toHaveBeenCalled();
    },
  );
});
