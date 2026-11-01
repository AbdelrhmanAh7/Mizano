import React from 'react';
import { render, screen, within } from '@testing-library/react';
import InvoiceDetailPage from './page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'inv1' }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Formats like the real formatter: currency code, then two decimals.
jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (v: unknown, currency?: string) =>
    `${currency ?? 'XXX'} ${Number(v ?? 0).toFixed(2)}`,
}));

jest.mock('@/lib/date-locale', () => ({ useDateFnsLocale: () => undefined }));
jest.mock('@/lib/hooks/use-date-locale', () => ({
  useDateFormatter: () => (d: Date | string) => String(d),
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

jest.mock('@/components/sales/external-einvoice-reference', () => ({
  ExternalEInvoiceReference: () => null,
}));
jest.mock('@/components/shared/document-pdf-actions', () => ({
  DocumentPdfActions: () => null,
}));

const mockUseInvoice = jest.fn();
const mutation = { mutateAsync: jest.fn(), isPending: false };
jest.mock('@/lib/hooks/use-invoices', () => ({
  useInvoice: (...args: unknown[]) => mockUseInvoice(...args),
  useDeleteInvoice: () => mutation,
  useSendInvoice: () => mutation,
  useVoidInvoice: () => mutation,
}));

const invoice = {
  id: 'inv1',
  invoiceNumber: 'INV-001',
  status: 'SENT',
  currencyCode: 'EGP',
  customerId: 'cust1',
  customer: { id: 'cust1', name: 'Nile Traders' },
  date: '2026-11-01T00:00:00.000Z',
  dueDate: '2026-12-01T00:00:00.000Z',
  subtotal: '1000',
  taxTotal: '0',
  discountTotal: '0',
  grandTotal: '1000',
  balanceDue: '900',
  lines: [],
  paymentAllocations: [],
  // The API selects `amount` only (credit notes have no `total`).
  creditNotes: [
    {
      id: 'cn1',
      creditNoteNumber: 'CN-001',
      amount: '100',
      date: '2026-11-01T00:00:00.000Z',
      type: 'APPLY_TO_INVOICE',
    },
  ],
};

describe('InvoiceDetailPage credit notes', () => {
  it('shows each credit note with its amount in the invoice currency (issue #656)', () => {
    mockUseInvoice.mockReturnValue({ data: invoice, isLoading: false });

    render(<InvoiceDetailPage />);

    const row = screen.getByRole('link', { name: 'CN-001' }).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('EGP 100.00')).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText('EGP 0.00')).not.toBeInTheDocument();
  });
});
