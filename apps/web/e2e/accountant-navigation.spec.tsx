import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InvoicePage from '../app/[locale]/(dashboard)/sales/invoices/new/page';
import ReceivedPage from '../app/[locale]/(dashboard)/sales/payments/new/page';
import MadePage from '../app/[locale]/(dashboard)/purchases/payments/new/page';

const mockPush = jest.fn();
const mockMutation = jest.fn();
let mockLocale = 'en';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: (path: string) => mockPush(`/${mockLocale}${path}`) }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={`/${mockLocale}${href}`}>{children}</a>
  ),
}));
jest.mock('@/lib/hooks/use-invoices', () => ({
  useCreateInvoice: () => ({ mutateAsync: mockMutation, isPending: false }),
}));
jest.mock('@/lib/hooks/use-tax', () => ({
  useTaxRateOptions: () => ({ options: [], isLoading: false, isError: false }),
}));
jest.mock('@/lib/hooks/use-payments-received', () => ({
  useCreatePaymentReceived: () => ({ mutateAsync: mockMutation, isPending: false }),
}));
jest.mock('@/lib/hooks/use-payments-made', () => ({
  useCreatePaymentMade: () => ({ mutateAsync: mockMutation, isPending: false }),
}));
jest.mock('@/lib/hooks/use-vendors', () => ({
  useVendors: () => ({ data: { data: [] }, isLoading: false }),
}));
jest.mock('@/lib/hooks/use-bank-accounts', () => ({
  useBankAccounts: () => ({ data: { data: [] }, isLoading: false }),
}));

type FormProps = {
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
};

function MockForm({ onSubmit, onCancel }: FormProps): React.JSX.Element {
  return (
    <>
      <button
        onClick={() =>
          void onSubmit({ allocations: [{ invoiceId: 'fixture-invoice', amount: '228.0000' }] })
        }
      >
        submit fixture
      </button>
      <button onClick={onCancel}>cancel fixture</button>
    </>
  );
}

jest.mock('@/components/sales/invoice-form', () => ({
  InvoiceForm: (props: FormProps) => <MockForm {...props} />,
}));
jest.mock('@/components/sales/payment-received-form', () => ({
  PaymentReceivedForm: (props: FormProps) => <MockForm {...props} />,
}));
jest.mock('@/components/purchases/payment-made-form', () => ({
  PaymentMadeForm: (props: FormProps) => <MockForm {...props} />,
}));

const cases = [
  { Page: InvoicePage, destination: '/sales/invoices/fixture', cancel: '/sales/invoices' },
  { Page: ReceivedPage, destination: '/sales/payments/fixture', cancel: '/sales/payments' },
  { Page: MadePage, destination: '/purchases/payments', cancel: '/purchases/payments' },
];

for (const locale of ['en', 'ar']) {
  describe(`${locale} accountant navigation`, () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockLocale = locale;
      mockMutation.mockResolvedValue({ id: 'fixture' });
    });

    it.each(cases)('keeps the locale after saving $destination', async ({ Page, destination }) => {
      render(<Page />);
      fireEvent.click(screen.getByText('submit fixture'));
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/${locale}${destination}`));
      expect(mockMutation).toHaveBeenCalledWith({
        allocations: [{ invoiceId: 'fixture-invoice', amount: '228.0000' }],
      });
    });

    it.each(cases)('keeps the locale when cancelling $cancel', ({ Page, cancel }) => {
      render(<Page />);
      fireEvent.click(screen.getByText('cancel fixture'));
      expect(mockPush).toHaveBeenCalledWith(`/${locale}${cancel}`);
      expect(screen.getByRole('link')).toHaveAttribute('href', `/${locale}${cancel}`);
    });

    it.each(cases)('stays on the form when saving $destination fails', async ({ Page }) => {
      mockMutation.mockRejectedValue(new Error('Synthetic unavailable'));
      render(<Page />);
      fireEvent.click(screen.getByText('submit fixture'));
      await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
}
