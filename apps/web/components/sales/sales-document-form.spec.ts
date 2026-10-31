/** @jest-environment node */
import { blankSalesLine, toSalesFormLines } from './sales-document-form';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/components/shared/party-combobox', () => ({}));

const taxRates = [
  { id: 'vat14', name: 'VAT 14%', rate: 14 },
  { id: 'vat5', name: 'VAT 5%', rate: 5 },
];

describe('toSalesFormLines (shared by invoice and quote forms)', () => {
  it('shows one blank line when the document has none', () => {
    expect(toSalesFormLines(undefined, taxRates)).toEqual([blankSalesLine()]);
  });

  it('keeps a stored tax-rate id, maps a stored percent to its option and keeps an unknown percent', () => {
    const lines = toSalesFormLines(
      [
        { description: 'A', quantity: '1', rate: '10', amount: '10', taxRateId: 'vat5' },
        { description: 'B', quantity: '2', rate: '5', amount: '10', taxRate: '14', discount: '3' },
        { description: 'C', quantity: '1', rate: '1', amount: '1', taxRate: '7.5' },
      ],
      taxRates,
    );
    expect(lines[0]).toMatchObject({ taxRateId: 'vat5', discountPercent: '0', itemId: '' });
    expect(lines[1]).toMatchObject({ taxRateId: 'vat14', discountPercent: '3' });
    expect(lines[2]).toMatchObject({ taxRateId: '', taxPercent: '7.50' });
  });
});
