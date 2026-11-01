import React from 'react';
import { render, screen } from '@testing-library/react';
import { BillForm } from './bill-form';
import enAi from '@/messages/en/ai.json';
import arAi from '@/messages/ar/ai.json';

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const t = (key: string, values?: Record<string, string>) =>
      values ? `${key}|${Object.values(values).join('|')}` : key;
    t.has = () => false;
    return t;
  },
}));
jest.mock('@/lib/hooks/use-organization', () => ({
  useMoneyFormat: () => ({ data: { baseCurrency: 'EGP', documentDigits: 'latn' } }),
  documentCurrency: (code: string | null | undefined, base: string | undefined) => code || base,
}));
const mockNoVendor = { data: undefined };
jest.mock('@/lib/hooks/use-vendors', () => ({ useVendor: () => mockNoVendor }));
jest.mock('@/components/shared/party-combobox', () => {
  const Closed = ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>;
  return { VendorCombobox: Closed, ItemCombobox: Closed };
});
jest.mock('@/lib/hooks/use-bills', () => ({
  useBillAccountOptions: () => ({
    isSuccess: true,
    isError: false,
    isPlaceholderData: false,
    data: { data: [], vendorDefaultAccountId: null },
    refetch: jest.fn(),
  }),
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
    expect(screen.getByTestId('bill-subtotal')).toHaveTextContent('EGP 200.00');
    expect(screen.getByTestId('bill-taxAmount')).toHaveTextContent('EGP 28.00');
    expect(screen.getByTestId('bill-grandTotal')).toHaveTextContent('EGP 228.00');
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

  it('offers "default currency" only when the scan read a currency (#587)', () => {
    const options = (): string[] =>
      Array.from(document.querySelectorAll<HTMLOptionElement>('select option')).map((o) => o.value);
    const { unmount } = renderForm(undefined);
    expect(options()).toContain('default');
    unmount();
    render(
      <BillForm
        scanDefaults={scanDefaults}
        requireCurrency
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(options()).toEqual(expect.arrayContaining(['EGP', 'SAR', 'AED']));
    expect(options()).not.toContain('default');
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
});

describe('BillForm scan review currency (issue #645)', () => {
  it('names no currency until the person picks one when the scan read none', () => {
    render(
      <BillForm
        scanDefaults={scanDefaults}
        requireCurrency
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('bill-amounts-currency')).not.toBeInTheDocument();
    expect(screen.getByTestId('bill-grandTotal')).toHaveTextContent(/^228\.00$/);
  });

  it('shows the scanned currency beside the totals', () => {
    render(
      <BillForm
        scanDefaults={{ ...scanDefaults, currencyCode: 'SAR' }}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByTestId('bill-amounts-currency')).toHaveTextContent('amountsIn|SAR');
    expect(screen.getByTestId('bill-grandTotal')).toHaveTextContent('SAR 228.00');
  });
});
