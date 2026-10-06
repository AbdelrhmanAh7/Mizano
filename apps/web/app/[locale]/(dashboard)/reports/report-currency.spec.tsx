/**
 * Every report page labels amounts with the `currencyCode` the API returns (the organization base
 * currency), through the real report hooks and transformers. Nothing may fall back to dollars.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en', options).format(date),
  }),
}));

jest.mock('@/components/reports/report-filters', () => ({
  ReportFilters: () => null,
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  api: { get: jest.fn() },
}));

import { api } from '@/lib/api';
import BalanceSheetReportPage from './balance-sheet/page';
import ProfitLossReportPage from './profit-loss/page';
import TrialBalanceReportPage from './trial-balance/page';
import CashFlowReportPage from './cash-flow/page';
import ARAgingReportPage from './ar-aging/page';
import APAgingReportPage from './ap-aging/page';

const mockGet = api.get as jest.Mock;

const account = { id: 'a1', code: '1010', name: 'Bank', type: 'ASSET', balance: '1500.0000' };
const agingPayload = {
  currencyCode: 'EGP',
  buckets: { current: [], days1_30: [], days31_60: [], days61_90: [], over90: [] },
  summary: {
    current: '700.0000',
    days1_30: '0.0000',
    days31_60: '0.0000',
    days61_90: '0.0000',
    over90: '0.0000',
    total: '700.0000',
    unappliedCredits: '0.0000',
    netTotal: '700.0000',
  },
};

/** API-shaped payloads (decimal strings) for an EGP organization. */
const payloads: Record<string, unknown> = {
  '/reports/balance-sheet': {
    currencyCode: 'EGP',
    assets: { current: { accounts: [account], total: '1500.0000' } },
    liabilities: { current: { accounts: [], total: '0.0000' } },
    equity: { accounts: [], retainedEarnings: '1500.0000' },
    totalAssets: '1500.0000',
    totalLiabilities: '0.0000',
    totalEquity: '1500.0000',
    totalLiabilitiesAndEquity: '1500.0000',
    isBalanced: true,
  },
  '/reports/profit-and-loss': {
    currencyCode: 'EGP',
    revenue: { accounts: [{ ...account, type: 'INCOME' }], total: '1500.0000' },
    totalIncome: '1500.0000',
    totalExpenses: '0.0000',
    netProfit: '1500.0000',
  },
  '/reports/trial-balance': {
    currencyCode: 'EGP',
    accounts: [{ id: 'a1', code: '1010', name: 'Bank', type: 'ASSET', debit: '1500.0000' }],
    totalDebits: '1500.0000',
    totalCredits: '1500.0000',
    isBalanced: true,
  },
  '/reports/cash-flow': {
    currencyCode: 'EGP',
    openingCashBalance: '100.0000',
    operating: { netIncome: '1500.0000', netCashFromOperating: '1500.0000' },
    netCashChange: '1500.0000',
    closingCashBalance: '1600.0000',
  },
  '/reports/receivables-aging': agingPayload,
  '/reports/payables-aging': agingPayload,
};

function renderPage(Page: React.ComponentType): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

describe('report pages show the API currency', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation(async (url: string) => {
      if (!(url in payloads)) throw new Error(`unexpected GET ${url}`);
      return { data: payloads[url] };
    });
  });

  it.each([
    ['balance sheet', BalanceSheetReportPage],
    ['profit and loss', ProfitLossReportPage],
    ['trial balance', TrialBalanceReportPage],
    ['cash flow', CashFlowReportPage],
    ['receivables aging', ARAgingReportPage],
    ['payables aging', APAgingReportPage],
  ])('%s renders EGP amounts for an EGP organization, never USD', async (_name, Page) => {
    const { container } = renderPage(Page);

    await waitFor(() => expect(container.textContent).toMatch(/EGP\s?[\d,]+\.\d{2}/));
    expect(container.textContent).not.toContain('$');
    expect(container.textContent).not.toContain('USD');
  });
});
