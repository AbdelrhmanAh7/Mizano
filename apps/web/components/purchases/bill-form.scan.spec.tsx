import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BillForm } from './bill-form';
import enAi from '@/messages/en/ai.json';
import arAi from '@/messages/ar/ai.json';
import enPurchases from '@/messages/en/purchases.json';
import arPurchases from '@/messages/ar/purchases.json';

jest.mock('next-intl', () => ({
  useTranslations: () => {
    const fn = (key: string, values?: Record<string, string>) =>
      values ? `${key}|${Object.values(values).join('|')}` : key;
    fn.has = () => true;
    return fn;
  },
}));
jest.mock('@/lib/hooks/use-vendors', () => ({
  useVendors: () => ({ data: { data: [] } }),
}));

const scanDefaults = {
  vendorId: '',
  date: '2026-09-01',
  dueDate: '2026-10-01',
  reference: '',
  currencyCode: '',
  notes: '',
  lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRate: '14' }],
};

function renderForm(extractedTotals: React.ComponentProps<typeof BillForm>['extractedTotals']) {
  return render(
    <BillForm
      scanDefaults={scanDefaults}
      extractedTotals={extractedTotals}
      onSubmit={jest.fn()}
      onCancel={jest.fn()}
    />,
  );
}

describe('BillForm scan review totals', () => {
  it('shows computed subtotal, tax and total from the percentage', () => {
    renderForm({ subtotal: 200, tax: 28, total: 228 });
    expect(screen.getAllByText('200.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('28.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('228.00').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('totals-discrepancy')).not.toBeInTheDocument();
  });

  it('warns when extracted totals disagree, keeping the computed values', () => {
    renderForm({ subtotal: 200, tax: 14, total: 214 });
    expect(screen.getByTestId('totals-discrepancy')).toBeInTheDocument();
    expect(screen.getAllByText('228.00').length).toBeGreaterThan(0);
  });

  it('notes an extracted header discount', () => {
    renderForm({ subtotal: 200, tax: 28, total: 228, discount: 10 });
    expect(screen.getByTestId('totals-discrepancy')).toHaveTextContent('discrepancyDiscount');
  });

  it('allows four-decimal quantity and rate without native step mismatches', () => {
    renderForm({});
    const quantity = document.querySelector<HTMLInputElement>('input[name="lines.0.quantity"]')!;
    const rate = document.querySelector<HTMLInputElement>('input[name="lines.0.rate"]')!;
    for (const [input, value] of [
      [quantity, '1.3751'],
      [rate, '19.9999'],
    ] as const) {
      input.value = value;
      expect(input.step).toBe('0.0001');
      expect(input.validity.stepMismatch).toBe(false);
    }
  });

  it('has the discrepancy copy in English and Arabic', () => {
    for (const intake of [enAi.intake, arAi.intake]) {
      for (const key of [
        'discrepancyTitle',
        'discrepancyBody',
        'discrepancyRow',
        'discrepancyDiscount',
      ]) {
        expect((intake as Record<string, unknown>)[key]).toEqual(expect.any(String));
      }
      expect(Object.keys(intake.discrepancyField)).toEqual(['subtotal', 'tax', 'total']);
    }
  });

  it('has the accountInvalidType copy in English and Arabic', () => {
    expect(enPurchases.bills.validation.accountInvalidType).toBe(
      'Account must be an expense or asset account',
    );
    expect(arPurchases.bills.validation.accountInvalidType).toBe(
      'يجب أن يكون الحساب حساب مصروفات أو أصول',
    );
  });

  it('rejects submission when a line references an invalid account type', async () => {
    const onSubmit = jest.fn();
    const accounts = [
      { id: 'acc-exp', code: '5000', name: 'Operating Expense', type: 'EXPENSE' },
      { id: 'acc-liab', code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
    ];
    const initialBill = {
      id: 'b1',
      billNumber: 'B-001',
      vendorId: 'v1',
      date: '2026-09-01T00:00:00.000Z',
      dueDate: '2026-10-01T00:00:00.000Z',
      reference: 'INV-1',
      currencyCode: 'USD',
      notes: '',
      projectId: '',
      lines: [
        {
          id: 'l1',
          billId: 'b1',
          itemId: null,
          accountId: 'acc-liab',
          description: 'Office supplies',
          quantity: 1,
          rate: 100,
          taxRate: 0,
          amount: 100,
        },
      ],
    } as unknown as React.ComponentProps<typeof BillForm>['bill'];

    render(
      <BillForm
        defaultVendorId="v1"
        bill={initialBill}
        accounts={accounts}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /update bill|create bill/i });
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/accountInvalidType/)).toBeInTheDocument();
  });

  it('allows submission when lines reference a valid expense account', async () => {
    const onSubmit = jest.fn();
    const accounts = [
      { id: 'acc-exp', code: '5000', name: 'Operating Expense', type: 'EXPENSE' },
      { id: 'acc-liab', code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
    ];
    const initialBill = {
      id: 'b1',
      billNumber: 'B-001',
      vendorId: 'v1',
      date: '2026-09-01T00:00:00.000Z',
      dueDate: '2026-10-01T00:00:00.000Z',
      reference: 'INV-1',
      currencyCode: 'USD',
      notes: '',
      projectId: '',
      lines: [
        {
          id: 'l1',
          billId: 'b1',
          itemId: null,
          accountId: 'acc-exp',
          description: 'Office supplies',
          quantity: 1,
          rate: 100,
          taxRate: 0,
          amount: 100,
        },
      ],
    } as unknown as React.ComponentProps<typeof BillForm>['bill'];

    render(
      <BillForm
        defaultVendorId="v1"
        bill={initialBill}
        accounts={accounts}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /update bill|create bill/i });
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorId: 'v1',
          lines: [expect.objectContaining({ accountId: 'acc-exp' })],
        }),
      );
    });
  });
});
