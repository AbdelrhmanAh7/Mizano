import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (amount: unknown) => `EGP ${Number(amount).toFixed(2)}`,
}));

jest.mock('@/lib/hooks/use-table-params', () => ({
  useTableParams: () => ({
    queryParams: {},
    sortBy: 'name',
    sortOrder: 'asc',
    setSort: jest.fn(),
    search: '',
    setSearch: jest.fn(),
    limit: 20,
    setPage: jest.fn(),
    setLimit: jest.fn(),
  }),
}));

jest.mock('@/components/data-table', () => ({
  DataTable: () => null,
  DataTableSearch: () => null,
  SortableHeader: () => null,
}));

const mockUseBankAccounts = jest.fn();
jest.mock('@/lib/hooks/use-bank-accounts', () => ({
  useBankAccounts: (...args: unknown[]) => mockUseBankAccounts(...args),
  useDeleteBankAccount: () => ({ mutateAsync: jest.fn(), isPending: false }),
  getAccountTypeLabel: (type: string) => type,
  getAccountTypeColor: () => '',
  accountTypeOptions: [],
}));

import BankAccountsPage from './page';

const account = (id: string, linkedAccountId: string, systemBalance: string) => ({
  id,
  name: id,
  accountNumber: null,
  type: 'BANK',
  currency: 'EGP',
  systemBalance,
  bankBalance: '0',
  linkedAccountId,
  isActive: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});

describe('BankAccountsPage total balance (#663)', () => {
  it('counts a ledger balance once when two bank accounts share its ledger account', () => {
    mockUseBankAccounts.mockReturnValue({
      data: {
        data: [
          account('Test Cash', 'acc-1000', '0.0000'),
          account('Test Bank', 'acc-1010', '20798.0000'),
          account('Test Bank 2', 'acc-1010', '20798.0000'),
        ],
        meta: { page: 1, limit: 20, total: 3, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<BankAccountsPage />);

    expect(screen.getByText('EGP 20798.00')).toBeInTheDocument();
    expect(screen.queryByText('EGP 41596.00')).not.toBeInTheDocument();
  });
});
