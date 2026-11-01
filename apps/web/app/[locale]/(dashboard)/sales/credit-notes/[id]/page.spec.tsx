import React from 'react';
import { render, screen } from '@testing-library/react';
import CreditNoteDetailPage from './page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cn1' }),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (v: unknown) => `EGP ${String(v ?? 0)}`,
}));

jest.mock('@/lib/date-locale', () => ({ useDateFnsLocale: () => undefined }));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

jest.mock('@/components/sales/external-einvoice-reference', () => ({
  ExternalEInvoiceReference: () => null,
}));

const mockUseCreditNote = jest.fn();
jest.mock('@/lib/hooks/use-credit-notes', () => ({
  useCreditNote: (...args: unknown[]) => mockUseCreditNote(...args),
  getCreditNoteTypeColor: () => '',
  creditNoteTypeKey: (type: string) => `creditNotes.types.${type}`,
}));

const creditNote = {
  id: 'cn1',
  creditNoteNumber: 'CN-001',
  customerId: 'cust1',
  customer: { id: 'cust1', name: 'Nile Traders', email: null },
  invoiceId: 'inv1',
  invoice: { id: 'inv1', invoiceNumber: 'INV-001', grandTotal: '1140', balanceDue: '570' },
  customerOutstandingBalance: '900',
  date: '2026-11-01T00:00:00.000Z',
  type: 'APPLY_TO_INVOICE',
  amount: '570',
  reason: 'Returned goods',
  organizationId: 'org1',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
};

describe('CreditNoteDetailPage', () => {
  it('shows the posted status, the invoice balance due and the customer balance after the credit', () => {
    mockUseCreditNote.mockReturnValue({ data: creditNote, isLoading: false });

    render(<CreditNoteDetailPage />);

    expect(screen.getByText('creditNotes.posted')).toBeInTheDocument();
    expect(screen.getByText('creditNotes.invoiceBalanceDue')).toBeInTheDocument();
    // The credit amount card and the invoice balance due both read 570 here.
    expect(screen.getAllByText('EGP 570')).toHaveLength(2);
    expect(screen.getByText('creditNotes.customerBalanceAfter')).toBeInTheDocument();
    expect(screen.getByText('EGP 900')).toBeInTheDocument();
  });

  it('leaves the balances out when the API does not send them', () => {
    mockUseCreditNote.mockReturnValue({
      data: {
        ...creditNote,
        customerOutstandingBalance: undefined,
        invoice: { id: 'inv1', invoiceNumber: 'INV-001', grandTotal: '1140' },
      },
      isLoading: false,
    });

    render(<CreditNoteDetailPage />);

    expect(screen.getByText('creditNotes.posted')).toBeInTheDocument();
    expect(screen.queryByText('creditNotes.invoiceBalanceDue')).not.toBeInTheDocument();
    expect(screen.queryByText('creditNotes.customerBalanceAfter')).not.toBeInTheDocument();
  });

  it('shows the not-found state without a status', () => {
    mockUseCreditNote.mockReturnValue({ data: undefined, isLoading: false });

    render(<CreditNoteDetailPage />);

    expect(screen.getByText('creditNotes.creditNoteNotFound')).toBeInTheDocument();
    expect(screen.queryByText('creditNotes.posted')).not.toBeInTheDocument();
  });
});
