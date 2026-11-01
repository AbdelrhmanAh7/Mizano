import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import QuoteDetailPage from './page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'q1' }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params?.number ? `${key} ${String(params.number)}` : key,
}));

jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (v: unknown, currency?: string) =>
    `${currency ?? 'XXX'} ${Number(v ?? 0).toFixed(2)}`,
}));
jest.mock('@/lib/hooks/use-date-locale', () => ({
  useDateFormatter: () => (d: Date | string) => String(d),
}));
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/shared/document-pdf-actions', () => ({
  DocumentPdfActions: () => null,
}));

const mockUseQuote = jest.fn();
const mutation = { mutateAsync: jest.fn(), isPending: false };
// The real hook resolves to the response body: the new invoice itself.
const convert = { mutateAsync: jest.fn(), isPending: false };
jest.mock('@/lib/hooks/use-quotes', () => ({
  useQuote: (...args: unknown[]) => mockUseQuote(...args),
  useDeleteQuote: () => mutation,
  useSendQuote: () => mutation,
  useAcceptQuote: () => mutation,
  useDeclineQuote: () => mutation,
  useConvertToInvoice: () => convert,
}));

const quote = {
  id: 'q1',
  quoteNumber: 'EST-0001',
  status: 'ACCEPTED',
  currencyCode: 'EGP',
  customerId: 'cust1',
  customer: { id: 'cust1', name: 'Nile Dental Clinic', email: null },
  date: '2026-11-02T00:00:00.000Z',
  expiryDate: '2026-12-02T00:00:00.000Z',
  subtotal: '200',
  taxAmount: '28',
  grandTotal: '228',
  notes: null,
  terms: null,
  lines: [],
  organizationId: 'org1',
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  deletedAt: null,
};

describe('QuoteDetailPage convert to invoice (#667)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    convert.mutateAsync.mockReset();
  });

  it('opens the new invoice after converting', async () => {
    mockUseQuote.mockReturnValue({ data: quote, isLoading: false });
    convert.mutateAsync.mockResolvedValue({ id: 'inv-new', invoiceNumber: 'INV-0001' });

    render(<QuoteDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'quotes.convertToInvoice' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'quotes.convertToInvoice' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/sales/invoices/inv-new'));
    expect(convert.mutateAsync).toHaveBeenCalledWith('q1');
  });

  it('links an invoiced quote to its invoice', () => {
    mockUseQuote.mockReturnValue({
      data: {
        ...quote,
        status: 'INVOICED',
        invoices: [{ id: 'inv-new', invoiceNumber: 'INV-0001' }],
      },
      isLoading: false,
    });

    render(<QuoteDetailPage />);

    expect(screen.getByRole('link', { name: 'quotes.openInvoice INV-0001' })).toHaveAttribute(
      'href',
      '/sales/invoices/inv-new',
    );
  });
});
