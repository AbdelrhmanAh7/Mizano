import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import en from '@/messages/en/purchases.json';
import ar from '@/messages/ar/purchases.json';

let mockLocale: 'en' | 'ar' = 'en';
jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  // Page strings fall back to their key; the currency strings under test are real messages.
  useTranslations: (namespace?: string) => (key: string) => {
    const path = `${namespace ?? ''}.${key}`.replace(/^purchases\./, '').split('.');
    const message = path.reduce<unknown>(
      (value, part) => (value as Record<string, unknown> | undefined)?.[part],
      mockLocale === 'ar' ? ar : en,
    );
    return typeof message === 'string' ? message : key;
  },
}));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { organizationId: 'org-1' } } }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  billsApi: {},
  paymentsMadeApi: {},
}));
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
jest.mock('@/lib/hooks/use-bulk-action', () => ({
  useBulkAction: () => ({ isLoading: false, execute: jest.fn() }),
}));
jest.mock('@/lib/hooks/use-export-all', () => ({
  useExportAll: () => ({ onExportAll: jest.fn() }),
}));
jest.mock('@/lib/hooks/use-table-params', () => {
  const params = {
    queryParams: {},
    filters: {},
    search: '',
    setSearch: jest.fn(),
    setFilter: jest.fn(),
    sortBy: 'date',
    sortOrder: 'desc',
    setSort: jest.fn(),
  };
  return { useTableParams: () => params };
});
jest.mock('@/lib/hooks/use-vendors', () => {
  const result = { data: { data: [{ id: 'v1', name: 'Vendor A' }] }, isLoading: false };
  return { useVendors: () => result };
});
jest.mock('@/lib/hooks/use-expenses', () => {
  const result = { data: { data: [] }, isLoading: false };
  return { useExpenses: () => result };
});
jest.mock('@/components/import/import-wizard', () => ({ ImportWizard: () => null }));
jest.mock('@/components/data-table/bulk-action-confirm', () => ({
  BulkActionConfirmDialog: () => null,
}));
// Render every row through the page's own cell renderers; the grid itself is not under test.
jest.mock('@/components/data-table', () => ({
  DataTable: ({
    columns,
    data,
  }: {
    columns: Array<{ cell?: (ctx: { row: { original: unknown } }) => React.ReactNode }>;
    data: unknown[];
  }) => (
    <div>
      {data.map((original, index) => (
        <div key={index}>
          {columns.map((column, columnIndex) => (
            <span key={columnIndex}>{column.cell?.({ row: { original } })}</span>
          ))}
        </div>
      ))}
    </div>
  ),
  DataTableSearch: () => null,
  DataTableDateRangeFilter: () => null,
  DataTableFacetedFilter: () => null,
  SortableHeader: () => null,
}));

const mockBill = {
  id: 'b1',
  billNumber: 'BILL-1',
  vendorId: 'v1',
  date: '2026-10-01',
  dueDate: '2099-10-31',
  status: 'OPEN',
  subtotal: '1000.0000',
  taxAmount: '234.5000',
  grandTotal: '1234.5000',
  balanceDue: '1234.5000',
  reference: null,
  currencyCode: null as string | null,
  notes: null,
  projectId: null,
  organizationId: 'org-1',
  vendor: { id: 'v1', name: 'Vendor A' },
  lines: [
    {
      id: 'l1',
      description: 'Paper',
      quantity: '1',
      rate: '1000.0000',
      amount: '1000.0000',
      taxRate: '14',
    },
  ],
  billAllocations: [],
};
const mockPayment = {
  id: 'p1',
  paymentNumber: 'PAY-1',
  vendorId: 'v1',
  date: '2026-10-02',
  amount: '500.0000',
  paymentMode: 'CASH',
  paidFromAccountId: 'a1',
  reference: null,
  notes: null,
  deletedAt: null,
  organizationId: 'org-1',
  vendor: { id: 'v1', name: 'Vendor A', email: null, currency: 'USD' },
  allocations: [],
};

// Stable references: pages put hook results in effect dependencies, so a fresh object per call
// would re-render forever.
const billResult = { data: mockBill, isLoading: false };
const billsResult = { data: { data: [mockBill] }, isLoading: false };
const infiniteBillsResult = { data: [mockBill], total: 1, isLoading: false, refetch: jest.fn() };
const paymentResult = { data: mockPayment, isLoading: false };
const infinitePaymentsResult = {
  data: [mockPayment],
  total: 1,
  isLoading: false,
  refetch: jest.fn(),
};
const mutation = { mutateAsync: jest.fn(), isPending: false };

jest.mock('@/lib/hooks/use-bills', () => ({
  ...jest.requireActual('@/lib/hooks/use-bills'),
  useBill: () => billResult,
  useBills: () => billsResult,
  useInfiniteBills: () => infiniteBillsResult,
  useApproveBill: () => mutation,
  useDeleteBill: () => mutation,
  useCloneBill: () => mutation,
}));
jest.mock('@/lib/hooks/use-payments-made', () => ({
  ...jest.requireActual('@/lib/hooks/use-payments-made'),
  usePaymentMade: () => paymentResult,
  useDeletePaymentMade: () => mutation,
  useInfinitePaymentsMade: () => infinitePaymentsResult,
  useUnpaidBills: () => billsResult,
}));

import api from '@/lib/api';
import { formatCurrency } from '@/lib/hooks/use-bills';
import PurchasesPage from './page';
import BillsPage from './bills/page';
import BillDetailPage from './bills/[id]/page';
import PaymentsPage from './payments/page';
import PaymentDetailPage from './payments/[id]/page';
import { PaymentMadeForm } from '@/components/purchases/payment-made-form';

const mockGet = api.get as jest.Mock;

const pages: Array<{ name: string; element: React.ReactElement; amount: string }> = [
  { name: 'purchases hub', element: <PurchasesPage />, amount: '1234.5000' },
  { name: 'bills list', element: <BillsPage />, amount: '1234.5000' },
  {
    name: 'bill detail',
    element: <BillDetailPage params={{ id: 'b1' }} />,
    amount: '1234.5000',
  },
  { name: 'payments list', element: <PaymentsPage />, amount: '500.0000' },
  {
    name: 'payment detail',
    element: <PaymentDetailPage params={{ id: 'p1' }} />,
    amount: '500.0000',
  },
  {
    name: 'payment form',
    element: (
      <PaymentMadeForm
        vendors={[{ id: 'v1', name: 'Vendor A' }]}
        bankAccounts={[]}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        preselectedVendorId="v1"
        preselectedBillId="b1"
      />
    ),
    amount: '1234.5000',
  },
];

function renderPage(element: React.ReactElement): ReturnType<typeof render> & {
  client: QueryClient;
} {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(<QueryClientProvider client={client}>{element}</QueryClientProvider>),
    client,
  };
}

describe.each(['en', 'ar'] as const)('purchases currency states (%s)', (locale) => {
  const messages = (locale === 'ar' ? ar : en).bills.currency;
  beforeEach(() => {
    mockLocale = locale;
    mockGet.mockReset();
    mockBill.currencyCode = null;
  });

  describe.each(pages)('$name', ({ element, amount }) => {
    it('shows a skeleton, never a dollar amount, while the base currency loads', async () => {
      let resolve!: (value: { data: { baseCurrency: string } }) => void;
      mockGet.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const { container } = renderPage(element);
      expect(screen.getAllByRole('status', { name: messages.loading }).length).toBeGreaterThan(0);
      expect(container.textContent).not.toMatch(/\$|USD/);

      await act(async () => resolve({ data: { baseCurrency: 'EGP' } }));
      await waitFor(() =>
        expect(screen.queryByRole('status', { name: messages.loading })).not.toBeInTheDocument(),
      );
      expect(container.textContent).toContain(formatCurrency(amount, 'EGP', locale));
      expect(container.textContent).not.toMatch(/\$|USD/);
    });

    it('shows an error with Retry on failure and recovers without a dollar amount', async () => {
      mockGet.mockRejectedValueOnce(new Error('HTTP 500'));
      const { container } = renderPage(element);
      const alerts = await screen.findAllByRole('alert');
      expect(alerts[0]).toHaveTextContent(messages.error);
      expect(container.textContent).not.toMatch(/\$|USD/);
      expect(screen.queryByRole('status', { name: messages.loading })).not.toBeInTheDocument();

      mockGet.mockResolvedValueOnce({ data: { baseCurrency: 'SAR' } });
      fireEvent.click(within(alerts[0]).getByRole('button', { name: messages.retry }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(container.textContent).toContain(formatCurrency(amount, 'SAR', locale));
      expect(container.textContent).not.toMatch(/\$|USD/);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ['bill detail', <BillDetailPage key="d" params={{ id: 'b1' }} />, '1234.5000'],
    ['bills list', <BillsPage key="l" />, '1234.5000'],
  ])(
    '%s keeps a bill in its own currency when the lookup fails',
    async (_name, element, amount) => {
      mockBill.currencyCode = 'AED';
      mockGet.mockRejectedValue(new Error('HTTP 500'));
      const { container, client } = renderPage(element);
      await waitFor(() =>
        expect(client.getQueryState(['organization', 'base-currency', 'org-1'])?.status).toBe(
          'error',
        ),
      );
      expect(container.textContent).toContain(formatCurrency(amount, 'AED', locale));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(/\$|USD/);
    },
  );
});
