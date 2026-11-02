import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ReconcileAccountPage from './page';
import enBanking from '@/messages/en/banking.json';
import arBanking from '@/messages/ar/banking.json';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Real English messages, so the test reads what a person sees.
jest.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, string>) => {
    if (ns !== 'banking') return key;
    const text = key
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], enBanking);
    if (typeof text !== 'string') return key;
    return text.replace(/\{(\w+)\}/g, (_m, name: string) => values?.[name] ?? '');
  },
  useLocale: () => 'en',
}));

jest.mock('@/lib/date-locale', () => ({ useDateFnsLocale: () => undefined }));
jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (amount: string | number) => `EGP ${Number(amount).toFixed(2)}`,
}));
jest.mock('@/lib/hooks/use-bank-accounts', () => ({
  useBankAccount: () => ({
    data: { id: 'ba-cib', name: 'CIB Current', bankName: 'CIB', currency: 'EGP' },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const mockMatches = jest.fn();
const mockMutate = jest.fn().mockResolvedValue({});
jest.mock('@/lib/hooks/use-bank-transactions', () => {
  const actual = jest.requireActual('@/lib/hooks/use-bank-transactions');
  return {
    ...actual,
    useUnmatchedTransactions: () => ({
      data: {
        data: [
          {
            id: 't-r100',
            date: '2026-11-02',
            description: 'Nile Dental Clinic receipt',
            type: 'DEPOSIT',
            amount: '100.0000',
            status: 'PENDING',
          },
          {
            id: 't-e300',
            date: '2026-11-02',
            description: 'November rent',
            type: 'WITHDRAWAL',
            amount: '300.0000',
            status: 'PENDING',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    }),
    useSuggestedMatches: (_account: string, transactionId: string) => ({
      data: mockMatches(transactionId),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    }),
    useMatchTransaction: () => ({ mutateAsync: mockMutate, isPending: false }),
  };
});

const rentMatch = {
  id: 'exp-rent',
  type: 'EXPENSE',
  number: 'November rent',
  date: '2026-11-02T00:00:00.000Z',
  amount: '300.0000',
  balanceDue: '0',
  counterpartyName: '',
  confidence: 99,
};

describe('ReconcileAccountPage expense matches (issue #682)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMatches.mockImplementation((id: string) => (id === 't-e300' ? [rentMatch] : []));
  });

  it('offers the recorded rent expense for the 300.00 withdrawal and links it on Match', async () => {
    render(<ReconcileAccountPage params={{ accountId: 'ba-cib' }} />);
    fireEvent.click(screen.getAllByText('November rent')[0]);

    expect(screen.getByText('Recorded expense: EGP 300.00')).toBeInTheDocument();
    expect(screen.queryByText('No suggested matches found')).not.toBeInTheDocument();
    // Money out can still be booked as a new expense when nothing matches.
    expect(screen.getByRole('link', { name: 'Create Expense' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(mockMutate).toHaveBeenCalledWith({
      id: 't-e300',
      documentId: 'exp-rent',
      documentType: 'EXPENSE',
    });
  });

  it('does not offer "Create Expense" on a deposit', () => {
    render(<ReconcileAccountPage params={{ accountId: 'ba-cib' }} />);
    fireEvent.click(screen.getByText('Nile Dental Clinic receipt'));

    expect(screen.getByText('No suggested matches found')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Expense' })).not.toBeInTheDocument();
  });

  it('has the recorded-expense label in English and Arabic', () => {
    expect(enBanking.reconciliation.recordedExpense).toBe('Recorded expense: {amount}');
    expect(arBanking.reconciliation.recordedExpense).toBe('مصروف مسجل: {amount}');
  });
});
