/**
 * Manual QA: every payment recorded from the web was rejected with "Validation Failed". The form
 * mapped the ticked allocations to { invoiceId, amount } and the page then filtered them again on
 * the form-only `selected` flag, so the API always received `allocations: []`.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { toPaymentReceivedPayload } from '@/components/sales/payment-received-form';
import { validateAllocations } from '@/lib/hooks/use-payments-received';

const mockMutateAsync = jest.fn();
const mockPush = jest.fn();

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});
jest.mock('@/lib/hooks/use-payments-received', () => ({
  ...jest.requireActual('@/lib/hooks/use-payments-received'),
  useCreatePaymentReceived: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const formPayload = toPaymentReceivedPayload({
  customerId: 'cust-1',
  date: '2026-10-31',
  amount: '531.87',
  paymentMode: 'BANK_TRANSFER',
  depositToAccountId: 'acc-1010',
  reference: '',
  notes: '',
  allocations: [
    { invoiceId: 'inv-2', amount: '331.87', selected: true },
    { invoiceId: 'inv-4', amount: '200.00', selected: true },
    { invoiceId: 'inv-5', amount: '50.00', selected: false },
    { invoiceId: 'inv-6', amount: '0', selected: true },
  ],
});

jest.mock('@/components/sales/payment-received-form', () => ({
  ...jest.requireActual('@/components/sales/payment-received-form'),
  PaymentReceivedForm: ({ onSubmit }: { onSubmit: (data: unknown) => void }) => (
    <button type="button" onClick={() => onSubmit(formPayload)}>
      submit
    </button>
  ),
}));

import NewPaymentReceivedPage from './page';

describe('recording a payment received', () => {
  beforeEach(() => jest.clearAllMocks());

  it('the form payload keeps only ticked, positive allocations without the selected flag', () => {
    expect(formPayload.allocations).toEqual([
      { invoiceId: 'inv-2', amount: '331.87' },
      { invoiceId: 'inv-4', amount: '200.00' },
    ]);
  });

  it('the page sends the allocations to the API unchanged', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'pay-1' });
    render(<NewPaymentReceivedPage />);
    fireEvent.click(screen.getByText('submit'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync.mock.calls[0][0].allocations).toEqual([
      { invoiceId: 'inv-2', amount: '331.87' },
      { invoiceId: 'inv-4', amount: '200.00' },
    ]);
    expect(mockPush).toHaveBeenCalledWith('/sales/payments/pay-1');
  });

  it('allocations balance only when they equal the payment exactly, like the API', () => {
    expect(
      validateAllocations('531.87', [{ amount: '331.87' }, { amount: '200.00' }]).isValid,
    ).toBe(true);
    // A float sum with a 0.01 tolerance accepted this; the API rejects it.
    expect(validateAllocations('100.005', [{ amount: '100.00' }]).isValid).toBe(false);
    expect(validateAllocations('0.3', [{ amount: '0.1' }, { amount: '0.2' }]).isValid).toBe(true);
  });
});
