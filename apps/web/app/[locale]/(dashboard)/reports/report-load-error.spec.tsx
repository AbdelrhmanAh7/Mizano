import React, { createContext, useContext } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import en from '@/messages/en/reports.json';
import ar from '@/messages/ar/reports.json';

let mockLocale: 'en' | 'ar' = 'en';
jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  useTranslations:
    () =>
    (key: string, values: Record<string, string | number> = {}) => {
      const message = key
        .split('.')
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)[part],
          mockLocale === 'ar' ? ar : en,
        );
      if (typeof message !== 'string') throw new Error(`Missing ${mockLocale} translation: ${key}`);
      return message.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name]));
    },
  useFormatter: () => ({
    dateTime: (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(mockLocale, options).format(date),
  }),
}));
jest.mock('@/lib/api', () => ({ __esModule: true, api: { get: jest.fn() } }));
jest.mock('@/lib/hooks/use-accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', code: '1010', name: 'Bank' }] }),
}));
jest.mock('@/components/data-table/data-table', () => ({
  DataTable: ({ data, emptyMessage }: { data: unknown[]; emptyMessage: string }) => (
    <div>{data.length === 0 && <p>{emptyMessage}</p>}</div>
  ),
}));
// A native-feeling stand-in for the Radix select (which needs pointer APIs jsdom lacks): every
// item is a button that reports its value.
jest.mock('@/components/ui/select', () => {
  const Choose = createContext<(value: string) => void>(() => undefined);
  const Item = ({ value, children }: { value: string; children: React.ReactNode }) => {
    const choose = useContext(Choose);
    return (
      <button type="button" onClick={() => choose(value)}>
        {children}
      </button>
    );
  };
  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => <Choose.Provider value={onValueChange}>{children}</Choose.Provider>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: Item,
  };
});

import { api } from '@/lib/api';
import TrialBalancePage from './trial-balance/page';
import BalanceSheetPage from './balance-sheet/page';
import ProfitLossPage from './profit-loss/page';
import CashFlowPage from './cash-flow/page';
import ARAgingPage from './ar-aging/page';
import APAgingPage from './ap-aging/page';
import GeneralLedgerPage from './general-ledger/page';
import SalesByCustomerPage from './sales-by-customer/page';
import SalesByItemPage from './sales-by-item/page';
import PurchasesByVendorPage from './purchases-by-vendor/page';

const mockGet = api.get as jest.Mock;

type Case = {
  name: string;
  Page: React.ComponentType;
  url: string;
  empty: (messages: typeof en) => string | null;
  chooseAccount?: boolean;
};

const cases: Case[] = [
  {
    name: 'trial balance',
    Page: TrialBalancePage,
    url: '/reports/trial-balance',
    empty: (m) => m.trialBalance.empty,
  },
  {
    name: 'balance sheet',
    Page: BalanceSheetPage,
    url: '/reports/balance-sheet',
    empty: (m) => m.balanceSheet.empty,
  },
  {
    name: 'profit and loss',
    Page: ProfitLossPage,
    url: '/reports/profit-and-loss',
    empty: (m) => m.profitLoss.empty,
  },
  { name: 'cash flow', Page: CashFlowPage, url: '/reports/cash-flow', empty: () => null },
  {
    name: 'receivables aging',
    Page: ARAgingPage,
    url: '/reports/receivables-aging',
    empty: (m) => m.arAging.empty,
  },
  {
    name: 'payables aging',
    Page: APAgingPage,
    url: '/reports/payables-aging',
    // Its buckets summary has its own empty text; the failed load must not reach it.
    empty: (m) => m.apAging.empty,
  },
  {
    name: 'general ledger',
    Page: GeneralLedgerPage,
    url: '/reports/general-ledger/a1',
    empty: (m) => m.generalLedger.empty,
    chooseAccount: true,
  },
  {
    name: 'sales by customer',
    Page: SalesByCustomerPage,
    url: '/reports/sales-by-customer',
    empty: (m) => m.salesByCustomer.empty,
  },
  {
    name: 'sales by item',
    Page: SalesByItemPage,
    url: '/reports/sales-by-item',
    empty: (m) => m.salesByItem.empty,
  },
  {
    name: 'purchases by vendor',
    Page: PurchasesByVendorPage,
    url: '/reports/purchases-by-vendor',
    empty: (m) => m.purchasesByVendor.empty,
  },
];

function renderPage(Page: React.ComponentType): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

describe.each(['en', 'ar'] as const)('report load errors (%s)', (locale) => {
  const messages = locale === 'ar' ? ar : en;
  beforeEach(() => {
    mockLocale = locale;
    mockGet.mockReset();
  });

  it.each(cases)(
    '$name shows an error with Retry, not the empty state, and recovers',
    async ({ Page, url, empty, chooseAccount }) => {
      let failures = 1;
      mockGet.mockImplementation(async (requested: string) => {
        if (requested !== url) throw new Error(`Unexpected GET ${requested}`);
        if (failures-- > 0) throw new Error('HTTP 500 internal detail');
        return { data: { currencyCode: 'EGP', buckets: [], accounts: [], entries: [] } };
      });
      renderPage(Page);
      if (chooseAccount) fireEvent.click(screen.getByRole('button', { name: '1010 - Bank' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(messages.loadError);
      expect(screen.queryByText(/internal detail|HTTP 500/)).not.toBeInTheDocument();
      const emptyMessage = empty(messages);
      if (emptyMessage) expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument();
      // The header (and so the filters beside it) stays so another period can be chosen.
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: messages.retry }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(mockGet).toHaveBeenCalledTimes(2);
      // After a successful load the empty state is the honest one again.
      if (emptyMessage) expect(await screen.findByText(emptyMessage)).toBeInTheDocument();
    },
  );
});
