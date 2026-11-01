/**
 * Manual QA of "pay a bill with a payment made":
 * - the vendor list held only the API's first page (20 of 121 vendors), so the vendor with the
 *   open bill could not be chosen; the form now uses the server-searched VendorCombobox;
 * - two bank registers on one GL account gave the "Paid From" select duplicate values;
 * - the form was English only and showed amounts in the vendor currency with a USD fallback.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentMadeForm } from './payment-made-form';

let mockLocale: 'en' | 'ar' = 'en';
jest.mock('next-intl', () => {
  const messages = {
    en: {
      purchases: jest.requireActual('@/messages/en/purchases.json'),
      common: jest.requireActual('@/messages/en/common.json'),
    },
    ar: {
      purchases: jest.requireActual('@/messages/ar/purchases.json'),
      common: jest.requireActual('@/messages/ar/common.json'),
    },
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages[mockLocale],
      );
  return {
    useLocale: () => mockLocale,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, string | number>) =>
        String(lookup(`${namespace}.${key}`) ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values?.[name] ?? ''),
        );
      t.has = (key: string) => typeof lookup(`${namespace}.${key}`) === 'string';
      return t;
    },
  };
});

jest.mock('@/lib/hooks/use-organization', () => ({
  ...jest.requireActual('@/lib/hooks/use-organization'),
  useBaseCurrency: () => 'EGP',
  useMoneyFormat: () => ({ data: { baseCurrency: 'EGP', documentDigits: 'latn' } }),
}));

// The real picker searches the server; vendor 150 is beyond any first page.
jest.mock('@/components/shared/party-combobox', () => ({
  VendorCombobox: ({ onValueChange }: { onValueChange: (id: string) => void }) => (
    <button type="button" onClick={() => onValueChange('vendor-150')}>
      pick vendor 150
    </button>
  ),
}));

// Stable results, like React Query's: a new object per render would re-run the form's effect.
const mockUnpaid: {
  isLoading: boolean;
  data: { data: Array<Record<string, string | null>> };
} = {
  isLoading: false,
  data: {
    data: [
      {
        id: 'bill-1',
        billNumber: 'V-9001',
        date: '2026-10-31',
        dueDate: '2026-11-30',
        grandTotal: '1418',
        balanceDue: '918',
      },
    ],
  },
};
const mockNoVendor = { isLoading: false, data: undefined };
jest.mock('@/lib/hooks/use-payments-made', () => ({
  ...jest.requireActual('@/lib/hooks/use-payments-made'),
  useUnpaidBills: (vendorId?: string) => (vendorId ? mockUnpaid : mockNoVendor),
}));

const registers = [
  { id: 'reg-main', name: 'Main bank', type: 'BANK', linkedAccountId: 'gl-1010' },
  { id: 'reg-second', name: 'Second register', type: 'BANK', linkedAccountId: 'gl-1010' },
];

describe('PaymentMadeForm', () => {
  const originalBills = mockUnpaid.data.data;
  beforeEach(() => {
    mockLocale = 'en';
    mockUnpaid.data.data = originalBills;
  });

  it('pays a bill of a vendor beyond the first page, from the chosen register GL account', async () => {
    const onSubmit = jest.fn();
    render(<PaymentMadeForm bankAccounts={registers} onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByText('pick vendor 150'));
    expect(await screen.findByText('V-9001')).toBeInTheDocument();
    // Amounts in the organization base currency, not a guessed USD.
    expect(screen.getAllByText(/EGP/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$/)).toBeNull();

    // Two registers share gl-1010: each is its own option, the GL account is what gets posted.
    const selects = document.querySelectorAll('select');
    const paidFrom = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === 'reg-second'),
    ) as HTMLSelectElement;
    expect(Array.from(paidFrom.options).map((o) => o.value)).toEqual(
      expect.arrayContaining(['reg-main', 'reg-second']),
    );
    fireEvent.change(paidFrom, { target: { value: 'reg-second' } });

    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Auto-Allocate'));
    fireEvent.click(screen.getByText('Record Payment'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        vendorId: 'vendor-150',
        paidFromAccountId: 'gl-1010',
        amount: '500.00',
        allocations: [{ billId: 'bill-1', amount: '500.00' }],
      }),
    );
  });

  it('allocates with exact decimal strings, never float money (#83)', async () => {
    const onSubmit = jest.fn();
    mockUnpaid.data.data = [
      {
        ...mockUnpaid.data.data[0],
        id: 'bill-a',
        billNumber: 'A',
        balanceDue: '0.1',
        grandTotal: '0.1',
      },
      {
        ...mockUnpaid.data.data[0],
        id: 'bill-b',
        billNumber: 'B',
        balanceDue: '0.2',
        grandTotal: '0.2',
        currencyCode: 'EGP',
      },
    ];
    render(<PaymentMadeForm bankAccounts={registers} onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByText('pick vendor 150'));
    expect(await screen.findByText('B')).toBeInTheDocument();
    expect(screen.queryByText(/\$|USD/)).toBeNull();
    const paidFrom = Array.from(document.querySelectorAll('select')).find((el) =>
      Array.from(el.options).some((o) => o.value === 'reg-main'),
    ) as HTMLSelectElement;
    fireEvent.change(paidFrom, { target: { value: 'reg-main' } });

    // 0.1 + 0.2 is 0.30000000000000004 in floats; the form must still see them as 0.3.
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '0.3' } });
    fireEvent.click(screen.getByText('Auto-Allocate'));
    fireEvent.click(screen.getByText('Record Payment'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        amount: '0.30',
        allocations: [
          { billId: 'bill-a', amount: '0.10' },
          { billId: 'bill-b', amount: '0.20' },
        ],
      }),
    );
  });

  it('is translated in Arabic', () => {
    mockLocale = 'ar';
    render(<PaymentMadeForm bankAccounts={registers} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('بيانات الدفعة')).toBeInTheDocument();
    expect(screen.getByText('تسجيل الدفعة')).toBeInTheDocument();
    expect(screen.queryByText('Payment Details')).toBeNull();
  });
});
