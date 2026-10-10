import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stable reference: the form re-syncs its allocations whenever this query result changes.
const mockUnpaidBills = {
  isLoading: false,
  data: {
    data: [
      {
        id: 'b1',
        billNumber: 'BILL-1',
        date: '2026-01-01',
        dueDate: '2026-02-01',
        grandTotal: '100.10',
        balanceDue: '100.10',
      },
      {
        id: 'b2',
        billNumber: 'BILL-2',
        date: '2026-01-02',
        dueDate: '2026-02-02',
        grandTotal: '50.20',
        balanceDue: '50.20',
      },
    ],
  },
};

jest.mock('@/lib/hooks/use-payments-made', () => ({
  useUnpaidBills: () => mockUnpaidBills,
  paymentModeOptions: [{ value: 'BANK_TRANSFER', label: 'Bank Transfer' }],
}));

jest.mock('@/lib/hooks/use-organization', () => ({
  useDocumentMoney: () => (amount: string | number) => `EGP ${amount}`,
}));

import { PaymentMadeForm } from './payment-made-form';

function renderForm(onSubmit = jest.fn()) {
  render(
    <PaymentMadeForm
      vendors={[{ id: 'v1', name: 'Vendor', currency: 'USD' }]}
      bankAccounts={[{ id: 'a1', name: 'Bank', type: 'BANK', linkedAccountId: 'l1' }]}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      preselectedVendorId="v1"
    />,
  );
  return onSubmit;
}

describe('PaymentMadeForm decimal allocations', () => {
  it('auto-allocates exactly, with no float drift, and shows the base currency', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '150.30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Auto-Allocate' }));

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    // Payment amount and total allocated both read 150.30 (exact sum, not 150.29999...).
    expect(screen.getAllByText('EGP 150.30')).toHaveLength(2);
    const inputs = screen.getAllByRole('spinbutton').slice(1) as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(['100.10', '50.20']);
  });

  it('clamps an allocation to the bill balance', async () => {
    renderForm();
    const input = screen.getAllByRole('spinbutton')[1] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999' } });
    expect(input.value).toBe('100.10');
  });
});
