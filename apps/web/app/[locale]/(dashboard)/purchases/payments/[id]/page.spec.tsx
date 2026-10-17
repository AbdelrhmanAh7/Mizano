import React from 'react';
import { render, screen } from '@testing-library/react';
import PaymentDetailPage from './page';

jest.mock('next-intl', () => ({
  useTranslations: () => {
    const messages: Record<string, string> = {
      'payments.voidPayment': 'Void',
      'payments.voidPaymentTitle': 'Void payment',
      'payments.voidPaymentConfirm': 'Voiding this payment will reverse it.',
      'payments.paymentTo': 'Payment to Acme Corp',
      'buttons.delete': 'Delete',
      'buttons.cancel': 'Cancel',
    };
    return (key: string) => messages[key] || key;
  },
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

const mockPayment = {
  id: 'pm-1',
  paymentNumber: 'PAY-0001',
  date: '2026-03-01T00:00:00.000Z',
  paymentDate: '2026-03-01T00:00:00.000Z',
  amount: 500,
  paymentMode: 'BANK_TRANSFER',
  reference: 'REF-123',
  notes: 'Payment for supplies',
  deletedAt: null,
  vendor: { id: 'v-1', name: 'Acme Corp' },
  paidFromAccount: { id: 'acc-1', name: 'Main Checking', code: '1010' },
  allocations: [],
};

jest.mock('@/lib/hooks/use-payments-made', () => ({
  usePaymentMade: () => ({ data: mockPayment, isLoading: false }),
  useDeletePaymentMade: () => ({ mutateAsync: jest.fn() }),
  formatPaymentMode: (mode: string) => mode,
  formatCurrency: (amount: number) => `$${amount}`,
}));

jest.mock('@/lib/hooks/use-organization', () => ({
  useBaseCurrency: () => 'USD',
}));

describe('PaymentDetailPage', () => {
  it('payment detail shows Void', () => {
    render(<PaymentDetailPage params={{ id: 'pm-1' }} />);

    // The trigger button should show "Void"
    const voidButton = screen.getByRole('button', { name: /void/i });
    expect(voidButton).toBeInTheDocument();

    // It should not show "Delete" for a live payment
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });
});
