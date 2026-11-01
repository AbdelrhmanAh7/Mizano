import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ProfitLossReportPage from './profit-loss/page';
import BalanceSheetReportPage from './balance-sheet/page';
import TrialBalanceReportPage from './trial-balance/page';
import GeneralLedgerPage from './general-ledger/page';
import { ledgerHref } from '@/components/reports/report-page';

// #669: every report figure opens the General Ledger of its account and period, from where
// each line opens its journal and source document. Figures are the golden scenario's
// (test-cases C09, as of 2026-11-30).

let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearch,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
jest.mock('next-intl', () => {
  const t = (key: string) => key;
  t.has = () => false;
  return { useTranslations: () => t };
});
jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (v: unknown) => `EGP ${Number(v ?? 0).toFixed(2)}`,
}));
jest.mock('@/lib/hooks/use-date-locale', () => ({
  useDateFormatter: () => (d: Date | string) => String(d),
}));
jest.mock('@/lib/date-locale', () => ({ useDateFnsLocale: () => undefined }));
jest.mock('@/components/reports/report-filters', () => ({ ReportFilters: () => null }));
jest.mock('@/components/reports/monthly-summary-card', () => ({
  MonthlySummaryCard: () => null,
}));
jest.mock('@/components/reports/trial-balance-empty', () => ({ TrialBalanceEmpty: () => null }));

const mockProfitLoss = jest.fn();
const mockBalanceSheet = jest.fn();
const mockTrialBalance = jest.fn();
const mockLedger = jest.fn();
jest.mock('@/lib/hooks/use-reports', () => ({
  useProfitLossReport: (...args: unknown[]) => mockProfitLoss(...args),
  useBalanceSheetReport: (...args: unknown[]) => mockBalanceSheet(...args),
  useTrialBalanceReport: (...args: unknown[]) => mockTrialBalance(...args),
  useGeneralLedgerReport: (...args: unknown[]) => mockLedger(...args),
}));
jest.mock('@/lib/hooks/use-accounts', () => ({
  useAccounts: () => ({ data: [] }),
  ACCOUNT_PICKER_PARAMS: {},
}));

const CIB_LEDGER =
  '/reports/general-ledger?accountId=acc-1010&startDate=2026-01-01&endDate=2026-11-30';

function linkTo(name: string): HTMLElement {
  return screen.getByRole('link', { name });
}

describe('report figures open the ledger (#669)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 30, 12) });
    mockSearch = new URLSearchParams();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds the ledger link of an account and period', () => {
    expect(ledgerHref('acc-1010', new Date(2026, 0, 1), new Date(2026, 10, 30))).toBe(CIB_LEDGER);
  });

  it('profit and loss: revenue 700.00 opens 4000 for the report period', () => {
    mockProfitLoss.mockReturnValue({
      isLoading: false,
      data: {
        income: [{ id: 'acc-4000', code: '4000', name: 'Sales', type: 'INCOME', balance: 700 }],
        expenses: [
          { id: 'acc-6100', code: '6100', name: 'Office expenses', type: 'EXPENSE', balance: 150 },
        ],
        totalIncome: 600,
        totalExpenses: 450,
        netProfit: 150,
      },
    });

    render(<ProfitLossReportPage />);

    const href =
      '/reports/general-ledger?accountId=acc-4000&startDate=2026-01-01&endDate=2026-11-30';
    expect(linkTo('EGP 700.00')).toHaveAttribute('href', href);
    expect(linkTo('Sales')).toHaveAttribute('href', href);
    expect(linkTo('EGP 150.00')).toHaveAttribute(
      'href',
      '/reports/general-ledger?accountId=acc-6100&startDate=2026-01-01&endDate=2026-11-30',
    );
  });

  it('balance sheet: CIB 49,757.00 opens its ledger; computed rows stay plain', () => {
    mockBalanceSheet.mockReturnValue({
      isLoading: false,
      data: {
        assets: [
          {
            id: 'current-assets',
            code: '',
            name: 'Current Assets',
            type: 'ASSET',
            balance: 50234,
            children: [
              { id: 'acc-1010', code: '1010', name: 'CIB', type: 'ASSET', balance: 49757 },
              { id: 'acc-1200', code: '1200', name: 'AR', type: 'ASSET', balance: 456 },
            ],
          },
        ],
        liabilities: [],
        equity: [
          {
            id: 'retained-earnings',
            code: '3100',
            name: 'Retained Earnings',
            type: 'EQUITY',
            balance: 150,
          },
        ],
        totalAssets: 50234,
        totalLiabilities: 84,
        totalEquity: 50150,
        totalLiabilitiesAndEquity: '50234.0000',
        isBalanced: true,
      },
    });

    render(<BalanceSheetReportPage />);

    expect(linkTo('EGP 49757.00')).toHaveAttribute('href', CIB_LEDGER);
    expect(linkTo('EGP 456.00')).toHaveAttribute(
      'href',
      '/reports/general-ledger?accountId=acc-1200&startDate=2026-01-01&endDate=2026-11-30',
    );
    expect(screen.queryByRole('link', { name: 'balanceSheet.currentAssets' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'balanceSheet.retainedEarnings' })).toBeNull();
  });

  it('trial balance: account name and amount open the ledger up to the as-of date', () => {
    mockTrialBalance.mockReturnValue({
      isLoading: false,
      data: {
        accounts: [
          { id: 'acc-1010', code: '1010', name: 'CIB', type: 'ASSET', debit: 49757, credit: 0 },
        ],
        totalDebits: 50784,
        totalCredits: 50784,
        isBalanced: true,
      },
    });

    render(<TrialBalanceReportPage />);

    const row = linkTo('CIB').closest('tr') as HTMLElement;
    expect(linkTo('CIB')).toHaveAttribute('href', CIB_LEDGER);
    expect(within(row).getByRole('link', { name: 'EGP 49757.00' })).toHaveAttribute(
      'href',
      CIB_LEDGER,
    );
    // An empty side is not a figure to open.
    expect(within(row).getAllByRole('link')).toHaveLength(2);
  });

  it('general ledger opens on the linked account and period', () => {
    mockSearch = new URLSearchParams({
      accountId: 'acc-1010',
      startDate: '2026-01-01',
      endDate: '2026-11-30',
    });
    mockLedger.mockReturnValue({
      isLoading: false,
      data: {
        openingBalance: 0,
        closingBalance: 49757,
        entries: [
          {
            date: '2026-11-01',
            journalId: 'jrn-1',
            journalNumber: 'JRN-001',
            description: 'Opening balance',
            debit: 50000,
            credit: 0,
            runningBalance: 50000,
          },
        ],
      },
    });

    render(<GeneralLedgerPage />);

    expect(mockLedger).toHaveBeenLastCalledWith('acc-1010', {
      startDate: '2026-01-01',
      endDate: '2026-11-30',
    });
    expect(linkTo('JRN-001')).toHaveAttribute('href', '/accounting/journals/jrn-1');
    expect(screen.getByText('EGP 49757.00')).toBeInTheDocument();
  });
});
