import React from 'react';
import { render, screen } from '@testing-library/react';
import { BillForm } from './bill-form';
import enAi from '@/messages/en/ai.json';
import arAi from '@/messages/ar/ai.json';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}|${Object.values(values).join('|')}` : key,
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
