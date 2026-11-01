import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

const mockIntake = {
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

jest.mock('@/lib/hooks/use-vendors', () => ({
  useCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/purchases/bill-form', () => ({ BillForm: () => null }));

const fileInput = (): HTMLInputElement => screen.getByTestId('scan-file-input');

describe('ScanBillPage document picker (issue #646)', () => {
  beforeAll(() => {
    // jsdom has no object URLs; the page previews images only.
    URL.createObjectURL = jest.fn(() => 'blob:preview');
  });

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
