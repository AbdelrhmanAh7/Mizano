import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import heic2any from 'heic2any';
import ScanBillPage from '../app/[locale]/(dashboard)/purchases/bills/scan/page';
import { useDocumentIntakeStream } from './hooks/use-ai-document-intake';
import { INTAKE_MAX_UPLOAD_BYTES } from './document-intake-upload';
import en from '../messages/en/ai.json';
import ar from '../messages/ar/ai.json';

let mockLocale: 'en' | 'ar' = 'en';
jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof en.intake) =>
    (mockLocale === 'en' ? en : ar).intake[key],
}));

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./hooks/use-ai-document-intake', () => ({
  useDocumentIntakeStream: jest.fn(),
  useDocumentIntakeConfirm: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('./hooks/use-vendors', () => ({ useCreateVendor: () => ({ mutateAsync: jest.fn() }) }));
jest.mock('../components/purchases/bill-form', () => ({ BillForm: () => null }));

describe('scan upload preserves originals and repairs invalid previews', () => {
  const upload = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    upload.mockClear();
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
    fireEvent.drop(screen.getByText('Drop your document here or click to browse'), {
      dataTransfer: { files: [file] },
    });
  }

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
