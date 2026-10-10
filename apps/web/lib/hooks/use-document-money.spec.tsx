import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));

import api from '@/lib/api';
import { useCompactMoney, useDocumentMoney, UNKNOWN_CURRENCY_AMOUNT } from './use-organization';
import { formatMoney } from '@/lib/format-money';
import { formatCurrency as formatBillCurrency } from './use-bills';
import { formatCurrency as formatVendorCurrency } from './use-vendors';
import { formatCurrency as formatExpenseCurrency } from './use-expenses';
import { formatCurrency as formatVendorCreditCurrency } from './use-vendor-credits';
import { formatCurrency as formatCustomerCurrency } from './use-customers';
import { formatCurrency as formatBankCurrency } from './use-bank-accounts';

const mockGet = api.get as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

describe('money formatting never defaults to USD', () => {
  it.each(['EGP', 'SAR', 'AED'])(
    'shows no $ or USD for a %s organization',
    async (baseCurrency) => {
      mockGet.mockResolvedValue({ data: { baseCurrency } });
      const { result } = renderHook(
        () => ({ money: useDocumentMoney(), compact: useCompactMoney() }),
        {
          wrapper,
        },
      );

      await waitFor(() =>
        expect(result.current.money('1234.50')).not.toBe(UNKNOWN_CURRENCY_AMOUNT),
      );

      for (const text of [
        result.current.money('1234.50'),
        result.current.money('1234.50', null),
        result.current.money('1234.50', undefined),
        result.current.compact(1500000),
      ]) {
        expect(text).not.toContain('$');
        expect(text).not.toContain('USD');
      }
    },
  );

  it('uses the document currency over the base currency', async () => {
    mockGet.mockResolvedValue({ data: { baseCurrency: 'EGP' } });
    const { result } = renderHook(() => useDocumentMoney(), { wrapper });
    await waitFor(() => expect(result.current('1', null)).not.toBe(UNKNOWN_CURRENCY_AMOUNT));
    expect(result.current('1.00', 'SAR')).toBe(formatMoney('1.00', 'SAR'));
  });

  it('renders a placeholder, not a guessed currency, while the base currency is unknown', () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(
      () => ({ money: useDocumentMoney(), compact: useCompactMoney() }),
      {
        wrapper,
      },
    );
    expect(result.current.money('10.00')).toBe(UNKNOWN_CURRENCY_AMOUNT);
    expect(result.current.compact(10)).toBe(UNKNOWN_CURRENCY_AMOUNT);
  });

  it('every shared formatter formats in the currency it is given', () => {
    for (const fmt of [
      formatBillCurrency,
      formatVendorCurrency,
      formatExpenseCurrency,
      formatVendorCreditCurrency,
      formatCustomerCurrency,
      formatBankCurrency,
    ]) {
      const text = fmt('1234.50', 'AED');
      expect(text).not.toContain('$');
      expect(text).toContain('1,234.50');
    }
  });
});
