import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScanBillPage from './page';
import enAi from '@/messages/en/ai.json';
import arAi from '@/messages/ar/ai.json';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const t = (key: string) => key;
    t.has = () => false;
    return t;
  },
}));

jest.mock('@/lib/hooks/use-ai-settings', () => ({
  useAiFeature: () => ({ active: false, isLoading: false }),
}));

const mockIntake: {
  processDocument: jest.Mock;
  progress: number;
  result: unknown;
  error: null;
  existingDraft: null;
} = {
  processDocument: jest.fn(),
  progress: 0,
  result: null,
  error: null,
  existingDraft: null,
};
jest.mock('@/lib/hooks/use-ai-document-intake', () => ({
  useDocumentIntakeStream: () => mockIntake,
  useDocumentIntakeConfirm: () => ({ mutateAsync: jest.fn(), isPending: false }),
  knownReviewReasons: () => [],
}));

const mockCreateVendor = jest.fn();
jest.mock('@/lib/hooks/use-vendors', () => ({
  useCreateVendor: () => ({ mutateAsync: mockCreateVendor, isPending: false }),
}));

const mockBillForm = jest.fn();
jest.mock('@/components/purchases/bill-form', () => ({
  BillForm: (props: unknown) => {
    mockBillForm(props);
    return null;
  },
}));

const fileInput = (): HTMLInputElement => screen.getByTestId('scan-file-input');

// jsdom has no object URLs; the page previews images only. Restored after this file.
const realCreateObjectURL = URL.createObjectURL;
beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:preview');
});
afterAll(() => {
  URL.createObjectURL = realCreateObjectURL;
});
afterEach(() => {
  mockIntake.result = null;
  jest.clearAllMocks();
});

describe('ScanBillPage create the read vendor (issue #671)', () => {
  it('puts the vendor it just created into the draft bill', async () => {
    // The sample bill: QA Vendor, QA-SCAN-001, 100.00 + 14.00 = 114.00, vendor not on file.
    mockIntake.result = {
      documentType: 'BILL',
      classificationConfidence: 1,
      extractedFields: {
        date: '2026-11-01',
        dueDate: null,
        total: 114,
        subtotal: 100,
        tax: 14,
        discount: null,
        documentNumber: 'QA-SCAN-001',
        vendorName: 'QA Vendor',
        vendorTaxId: null,
        currency: 'EGP',
        paymentTerms: null,
        customerName: null,
        lineItems: [],
      },
      fieldConfidence: {},
      ocrConfidence: 1,
      matchedVendor: null,
      vendorCandidates: [],
      matchedCustomer: null,
      customerCandidates: [],
      duplicateWarning: null,
      rawText: '',
      suggestCreateVendor: { name: 'QA Vendor', email: null, phone: null, taxId: null },
    };
    // POST /vendors answers the vendor itself.
    mockCreateVendor.mockResolvedValue({ id: 'vendor-qa', name: 'QA Vendor' });
    render(<ScanBillPage />);
    fireEvent.change(fileInput(), {
      target: { files: [new File(['%PDF-1.4'], 'sample-bill.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'processWithAi' }));
    await screen.findByRole('button', { name: 'createVendor' });
    expect(mockBillForm).toHaveBeenLastCalledWith(
      expect.objectContaining({ scanDefaults: expect.objectContaining({ vendorId: '' }) }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'createVendor' }));

    await waitFor(() =>
      expect(mockBillForm).toHaveBeenLastCalledWith(
        expect.objectContaining({
          scanDefaults: expect.objectContaining({
            vendorId: 'vendor-qa',
            reference: 'QA-SCAN-001',
          }),
        }),
      ),
    );
    expect(mockCreateVendor).toHaveBeenCalledWith(expect.objectContaining({ name: 'QA Vendor' }));
  });
});

describe('ScanBillPage document picker (issue #646)', () => {
  it('is a named button the keyboard reaches and opens the file input with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<ScanBillPage />);
    const openPicker = jest.spyOn(fileInput(), 'click');

    const choose = screen.getByRole('button', { name: 'chooseDocument' });
    // Tab order: back link first, then the picker.
    await user.tab();
    await user.tab();
    expect(choose).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(openPicker).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(openPicker).toHaveBeenCalledTimes(2);
  });

  it('enables "Read document" once a file is chosen through the input', () => {
    render(<ScanBillPage />);
    expect(screen.getByRole('button', { name: 'processWithAi' })).toBeDisabled();

    const file = new File(['%PDF-1.4'], 'bill-0042.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(screen.getByText('bill-0042.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'processWithAi' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'chooseAnother' })).toBeInTheDocument();
  });

  it('has the picker labels in English and Arabic', () => {
    expect(enAi.intake.scan.chooseDocument).toBe('Choose a document');
    expect(arAi.intake.scan.chooseDocument).toBe('اختر مستندًا');
    expect(enAi.intake.scan.chooseAnother).toBe('Choose another document');
    expect(arAi.intake.scan.chooseAnother).toBe('اختر مستندًا آخر');
  });
});
