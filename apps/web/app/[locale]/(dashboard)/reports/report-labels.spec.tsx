import React from 'react';
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
jest.mock('@/lib/hooks/use-accounts', () => ({ useAccounts: () => ({ data: [] }) }));
// Keep the report's actual column definitions; avoid unrelated URL/table pagination hooks.
jest.mock('@/components/data-table/data-table', () => ({
  DataTable: ({
    columns,
    data,
    emptyMessage,
  }: {
    columns: Array<{ header: string }>;
    data: unknown[];
    emptyMessage: string;
  }) => (
    <div>
      {columns.map((column) => (
        <span key={column.header}>{column.header}</span>
      ))}
      {data.length === 0 && <p>{emptyMessage}</p>}
    </div>
  ),
}));

import { api } from '@/lib/api';
import ReportsPage from './page';
import ReportsError from './error';
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
import { ReportFilters } from '@/components/reports/report-filters';

const mockGet = api.get as jest.Mock;
const account = { id: 'a1', code: '1010', name: 'Bank', type: 'ASSET', balance: '1500.0000' };
const aging = {
  currencyCode: 'EGP',
  buckets: {
    days1_30: [
      {
        invoiceId: 'i1',
        billId: 'b1',
        invoiceNumber: 'INV-1',
        billNumber: 'BILL-1',
        customerName: 'Customer A',
        vendorName: 'Vendor A',
        date: '2026-10-01',
        dueDate: '2026-10-02',
        amount: '700.0000',
        balanceDue: '700.0000',
        daysOverdue: 1,
      },
    ],
  },
  summary: { days1_30: '700.0000', total: '700.0000', netTotal: '700.0000' },
  invoiceCount: 1,
  billCount: 1,
};
const payloads: Record<string, unknown> = {
  '/reports/trial-balance': {
    currencyCode: 'EGP',
    accounts: [{ ...account, debit: '1500.0000' }],
    totalDebits: '1500.0000',
    totalCredits: '1000.0000',
    isBalanced: false,
  },
  '/reports/balance-sheet': {
    currencyCode: 'EGP',
    assets: { current: { accounts: [account] } },
    totalAssets: '1500.0000',
    totalLiabilitiesAndEquity: '1000.0000',
    isBalanced: false,
  },
  '/reports/profit-and-loss': {
    currencyCode: 'EGP',
    revenue: { accounts: [account], total: '1500.0000' },
  },
  '/reports/cash-flow': {
    currencyCode: 'EGP',
    operating: { netIncome: '1500.0000', netCashFromOperating: '1500.0000' },
  },
  '/reports/receivables-aging': aging,
  '/reports/payables-aging': aging,
  '/reports/sales-by-customer': {
    currencyCode: 'EGP',
    entries: [{ customerName: 'A' }],
    totalAmount: 1500,
    totalPaid: 1000,
    totalBalance: 500,
  },
  '/reports/sales-by-item': {
    currencyCode: 'EGP',
    entries: [{ itemName: 'A' }],
    totalAmount: 1500,
    totalQuantity: 1,
  },
  '/reports/purchases-by-vendor': {
    currencyCode: 'EGP',
    entries: [{ vendorName: 'A' }],
    totalAmount: 1500,
    totalPaid: 1000,
    totalBalance: 500,
    totalUnappliedCredits: '0.0000',
    totalNetPayable: '500.0000',
  },
};

function renderPage(Page: React.ComponentType): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

describe.each(['en', 'ar'] as const)('report labels (%s)', (locale) => {
  const messages = locale === 'ar' ? ar : en;
  beforeEach(() => {
    mockLocale = locale;
    mockGet.mockReset();
    mockGet.mockImplementation(async (url: string) => {
      if (!(url in payloads)) throw new Error(`Unexpected GET ${url}`);
      return { data: payloads[url] };
    });
  });

  it('translates report categories and descriptions', () => {
    renderPage(ReportsPage);
    expect(screen.getByText(messages.categories.accounting)).toBeInTheDocument();
    expect(screen.getByText(messages.categories.agingDescription)).toBeInTheDocument();
    expect(screen.getByText(messages.categories.financialDescription)).toBeInTheDocument();
    expect(screen.getByText(messages.categories.salesDescription)).toBeInTheDocument();
  });

  it('translates trial balance totals, differences, account types and date captions', async () => {
    const { container } = renderPage(TrialBalancePage);
    expect(await screen.findByText(messages.trialBalance.notBalanced)).toBeInTheDocument();
    expect(screen.getByText(messages.total)).toBeInTheDocument();
    expect(
      screen.getByText(messages.difference.replace('{amount}', 'EGP 500.00')),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.accountTypes.ASSET)).toBeInTheDocument();
    expect(screen.getByText(messages.code)).toBeInTheDocument();
    expect(container.textContent).toContain(messages.asOf.split('{date}')[0]);
    if (locale === 'ar')
      expect(container.textContent).not.toMatch(/Difference:|As of |Total|ASSET/);
  });

  it('translates the balanced trial balance state', async () => {
    mockGet.mockResolvedValueOnce({
      data: { ...(payloads['/reports/trial-balance'] as object), isBalanced: true },
    });
    renderPage(TrialBalancePage);
    expect(await screen.findByText(messages.trialBalance.balanced)).toBeInTheDocument();
    expect(screen.getByText(messages.trialBalance.equalTotals)).toBeInTheDocument();
  });

  it('translates the balance sheet status', async () => {
    renderPage(BalanceSheetPage);
    expect(await screen.findByText(messages.balanceSheet.notBalanced)).toBeInTheDocument();
  });

  it('translates cash-flow totals and computed row labels', async () => {
    renderPage(CashFlowPage);
    expect(await screen.findByText(messages.cashFlow.lines.netIncome)).toBeInTheDocument();
    expect(screen.getAllByText(messages.total)).toHaveLength(3);
  });

  it.each([
    ['receivables', ARAgingPage, messages.arAging, messages.customer],
    ['payables', APAgingPage, messages.apAging, messages.vendor],
  ] as const)(
    'translates %s aging buckets, counts and expanded headers',
    async (_name, Page, labels, counterparty) => {
      renderPage(Page);
      const bucket = await screen.findByRole('button', {
        name: new RegExp(messages.agingBuckets['1-30']),
      });
      expect(bucket).toHaveTextContent(
        ('invoiceCount' in labels ? labels.invoiceCount : labels.billCount).replace('{count}', '1'),
      );
      fireEvent.click(bucket);
      expect(screen.getByText(counterparty, { selector: 'th' })).toBeInTheDocument();
      expect(screen.getByText(messages.dueDate, { selector: 'th' })).toBeInTheDocument();
      expect(screen.getByText(messages.daysOverdue, { selector: 'th' })).toBeInTheDocument();
      expect(
        screen.getByText(labels.bucketTitle.replace('{bucket}', messages.agingBuckets['1-30'])),
      ).toBeInTheDocument();
    },
  );

  it.each([
    [
      'customer sales',
      SalesByCustomerPage,
      messages.salesByCustomer.totalSales,
      [
        messages.customer,
        messages.invoices,
        messages.totalAmount,
        messages.paid,
        messages.balanceDue,
      ],
    ],
    [
      'item sales',
      SalesByItemPage,
      messages.salesByItem.totalRevenue,
      [messages.item, messages.quantitySold, messages.averagePrice, messages.totalAmount],
    ],
    [
      'vendor purchases',
      PurchasesByVendorPage,
      messages.purchasesByVendor.totalPurchases,
      [messages.vendor, messages.bills, messages.totalAmount, messages.paid, messages.balanceDue],
    ],
  ] as const)('translates %s summary and table headers', async (_name, Page, summary, headers) => {
    renderPage(Page);
    expect(await screen.findByText(summary)).toBeInTheDocument();
    for (const header of headers) expect(screen.getByText(header)).toBeInTheDocument();
  });

  it.each([
    [BalanceSheetPage, messages.balanceSheet.empty],
    [ProfitLossPage, messages.profitLoss.empty],
    [TrialBalancePage, messages.trialBalance.empty],
    [ARAgingPage, messages.arAging.empty],
    [APAgingPage, messages.apAging.empty],
    [SalesByCustomerPage, messages.salesByCustomer.empty],
    [SalesByItemPage, messages.salesByItem.empty],
    [PurchasesByVendorPage, messages.purchasesByVendor.empty],
  ] as const)('translates empty report content', async (Page, emptyMessage) => {
    mockGet.mockResolvedValueOnce({
      data: { currencyCode: 'EGP', buckets: [], accounts: [], entries: [] },
    });
    renderPage(Page);
    expect(await screen.findByText(emptyMessage)).toBeInTheDocument();
  });

  it('translates the ledger account selector and its hint', () => {
    renderPage(GeneralLedgerPage);
    expect(screen.getByText(messages.generalLedger.selectAccountHint)).toBeInTheDocument();
    expect(screen.getByText(messages.trialBalance.account)).toBeInTheDocument();
  });

  it('translates report filters and export states', () => {
    const props = {
      asOfDate: new Date(2026, 9, 3),
      onAsOfDateChange: jest.fn(),
      showAsOfDate: true,
      onExport: jest.fn(),
    };
    const { rerender } = render(<ReportFilters {...props} />);
    expect(screen.getByText(messages.filters.thisMonth)).toBeInTheDocument();
    expect(screen.getByText(messages.filters.asOf)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.actions.export }));
    expect(props.onExport).toHaveBeenCalledTimes(1);
    rerender(<ReportFilters {...props} isExporting />);
    expect(screen.getByRole('button', { name: messages.filters.exporting })).toBeDisabled();
  });

  it('translates error and retry without exposing the raw error', () => {
    const reset = jest.fn();
    render(<ReportsError error={new Error('internal detail')} reset={reset} />);
    expect(screen.getByText(messages.errorTitle)).toBeInTheDocument();
    expect(screen.queryByText('internal detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

it('refreshes memoized report headers when the locale changes', async () => {
  mockLocale = 'en';
  mockGet.mockResolvedValue({ data: payloads['/reports/sales-by-customer'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = () => (
    <QueryClientProvider client={client}>
      <SalesByCustomerPage />
    </QueryClientProvider>
  );
  const view = render(page());
  await waitFor(() => expect(screen.getByText(en.customer)).toBeInTheDocument());
  mockLocale = 'ar';
  view.rerender(page());
  expect(screen.getByText(ar.customer)).toBeInTheDocument();
  expect(screen.queryByText(en.customer)).not.toBeInTheDocument();
});

it('keeps both report dictionaries complete, with matching placeholders and readable Arabic', () => {
  function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return typeof entry === 'string'
          ? [[path, entry]]
          : Object.entries(flatten(entry as Record<string, unknown>, path));
      }),
    );
  }
  const english = flatten(en);
  const arabic = flatten(ar);
  expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());
  for (const key of Object.keys(english)) {
    expect(arabic[key]).toMatch(/[\u0600-\u06ff]/);
    expect(arabic[key]).not.toMatch(/\?{2,}|\uFFFD/);
    expect(arabic[key].match(/\{\w+\}/g) ?? []).toEqual(english[key].match(/\{\w+\}/g) ?? []);
  }
});
