/**
 * Regression test (#598 C05, Arabic first-client walk): the account-type column of
 * Accounting → trial balance showed the raw enum (ASSET, LIABILITY, …) on Arabic screens.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import TrialBalancePage from './page';

// Real Arabic catalogs, so the assertions are the shipped copy.
jest.mock('next-intl', () => {
  const messages = {
    accounting: jest.requireActual('@/messages/ar/accounting.json'),
    common: jest.requireActual('@/messages/ar/common.json'),
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages,
      );
  return {
    useLocale: () => 'ar',
    useTranslations: (namespace: string) => {
      const t = (key: string) => String(lookup(`${namespace}.${key}`) ?? key);
      t.has = (key: string) => typeof lookup(`${namespace}.${key}`) === 'string';
      return t;
    },
  };
});

jest.mock('@/lib/hooks/use-date-locale', () => ({
  useDateFormatter: () => (value: string) => value,
}));

const account = (code: string, type: string) => ({
  id: `acc-${code}`,
  code,
  name: `حساب ${code}`,
  type,
  debit: '100',
  credit: '0',
});

jest.mock('@/lib/hooks/use-accounting-reports', () => ({
  useTrialBalance: () => ({
    data: {
      accounts: [
        account('1010', 'ASSET'),
        account('2000', 'LIABILITY'),
        account('3000', 'EQUITY'),
        account('4000', 'INCOME'),
        account('6100', 'EXPENSE'),
      ],
      totals: { totalDebits: '500', totalCredits: '500' },
      isBalanced: true,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

describe('Accounting trial balance', () => {
  it('labels account types in Arabic, not with the API enum', () => {
    render(<TrialBalancePage />);

    for (const label of ['أصول', 'التزامات', 'حقوق الملكية', 'إيرادات', 'مصروفات']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const raw of ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']) {
      expect(screen.queryByText(raw)).toBeNull();
    }
  });
});
