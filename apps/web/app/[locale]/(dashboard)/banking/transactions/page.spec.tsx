/**
 * Regression tests for BankTransactionsPage.
 *
 * Error 2/3: <Select.Item /> must not have value="" — Radix UI throws at render time.
 * Root cause: <SelectItem value="">All Status</SelectItem> crashed the page on every render.
 * Fix: use value="all" sentinel; state maps 'all' → undefined for the API query.
 *
 * Error 4: Missing @/components/ui/collapsible module.
 * Fix: replaced Collapsible with plain div + useState toggle.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Module mocks (must come before the component import) ──────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/banking/transactions',
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseBankTransactions = jest.fn();
jest.mock('@/lib/hooks/use-bank-transactions', () => ({
  useBankTransactions: (...args: unknown[]) => mockUseBankTransactions(...args),
  getStatusLabel: (s: string) => s,
  getStatusColor: () => '',
}));

jest.mock('@/components/banking/statement-import-zone', () => ({
  StatementImportZone: () => <div data-testid="import-zone">Import Zone</div>,
}));

// ── Import component after mocks ──────────────────────────────────────────────

import BankTransactionsPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderPage = () => render(<BankTransactionsPage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BankTransactionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBankTransactions.mockReturnValue({ data: null, isLoading: false });
  });

  // ── Regression: empty SelectItem value ──────────────────────────────────────

  it('renders without throwing (regression: empty SelectItem value crashed Radix UI)', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('does not render any SelectItem with an empty string value attribute', () => {
    const { container } = renderPage();
    // Radix renders items with data-radix-collection-item; also check role=option
    const options = container.querySelectorAll('[role="option"]');
    options.forEach((opt) => {
      expect(opt.getAttribute('data-value')).not.toBe('');
    });
  });

  it('renders the status filter Select showing "All Status" as the default selected value', () => {
    renderPage();
    // The SelectTrigger shows the currently-selected item's text
    expect(screen.getByText('transactions.allStatus')).toBeInTheDocument();
  });

  // ── Regression: missing collapsible module ───────────────────────────────────

  it('renders the Import Statement toggle button without a missing-module error', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /transactions.importStatement/i }),
    ).toBeInTheDocument();
  });

  it('toggles the import zone on clicking Import Statement', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /transactions.importStatement/i });

    // Initially hidden
    expect(screen.queryByTestId('import-zone')).not.toBeInTheDocument();

    // Show
    fireEvent.click(btn);
    expect(screen.getByTestId('import-zone')).toBeInTheDocument();

    // Hide again
    fireEvent.click(btn);
    expect(screen.queryByTestId('import-zone')).not.toBeInTheDocument();
  });

  it('toggles the advanced filters panel on clicking Filters', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /transactions.filters.title/i });

    // Initially hidden
    expect(screen.queryByLabelText(/date from/i)).not.toBeInTheDocument();

    fireEvent.click(btn);
    // Labels in this component use className only, no htmlFor — query by text
    expect(screen.getByText('transactions.filters.dateFrom')).toBeInTheDocument();
    expect(screen.getByText('transactions.filters.dateTo')).toBeInTheDocument();
  });

  // ── API query: 'all' maps to undefined (no status filter sent) ───────────────

  it('calls useBankTransactions with status=undefined when filter is "all"', () => {
    renderPage();
    expect(mockUseBankTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('renders skeleton while loading', () => {
    mockUseBankTransactions.mockReturnValue({ data: null, isLoading: true });
    const { container } = renderPage();
    // Skeletons render as divs with animate-pulse class
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  // ── Empty state ───────────────────────────────────────────────────────────────

  it('renders the empty state when no transactions are returned', () => {
    mockUseBankTransactions.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
      isLoading: false,
    });
    renderPage();
    // Text is rendered as siblings inside the div — use regex to match partial content
    expect(screen.getByText(/transactions\.empty\.title/)).toBeInTheDocument();
  });

  // ── Transaction rows ──────────────────────────────────────────────────────────

  it('renders transaction rows when data is present', () => {
    mockUseBankTransactions.mockReturnValue({
      data: {
        data: [
          {
            id: 'txn-1',
            date: '2026-03-01T00:00:00.000Z',
            description: 'ACME Corp payment',
            payee: 'ACME Corp',
            amount: '500.00',
            status: 'PENDING',
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText('ACME Corp payment')).toBeInTheDocument();
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('renders deposits with green colour class and withdrawals with red', () => {
    mockUseBankTransactions.mockReturnValue({
      data: {
        data: [
          {
            id: 'txn-deposit',
            date: '2026-03-01',
            description: 'Deposit',
            amount: '200.00',
            status: 'MATCHED',
          },
          {
            id: 'txn-withdrawal',
            date: '2026-03-01',
            description: 'Withdrawal',
            amount: '-100.00',
            status: 'RECONCILED',
          },
        ],
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      },
      isLoading: false,
    });
    const { container } = renderPage();
    const greenAmounts = container.querySelectorAll('.text-green-600');
    const redAmounts = container.querySelectorAll('.text-red-600');
    expect(greenAmounts.length).toBeGreaterThan(0);
    expect(redAmounts.length).toBeGreaterThan(0);
  });
});
