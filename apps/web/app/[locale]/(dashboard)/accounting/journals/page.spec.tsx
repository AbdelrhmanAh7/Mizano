/**
 * Regression tests for JournalsPage.
 *
 * Bug: `useInfiniteJournals` did not apply `transformJournal`, so `entryDate`
 * was undefined.  The column cell `format(new Date(row.original.entryDate), ...)`
 * threw RangeError: "Invalid time value" from date-fns because
 * `new Date(undefined)` produces an Invalid Date.
 *
 * Fix: `useInfiniteJournals` now maps `transformJournal` over fetched data,
 * which adds `entryDate: journal.date` (alias).
 *
 * The inline transformJournal() copy and its 8 tests were pruned (they tested a
 * re-implementation inside this spec, not production code); only page renders remain.
 */

import React from 'react';

// ── Page-level rendering tests ───────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/accounting/journals',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseInfiniteJournals = jest.fn();
const mockUseDeleteJournal = jest.fn();
const mockUsePostJournal = jest.fn();

jest.mock('@/lib/hooks/use-journals', () => ({
  useInfiniteJournals: (...args: unknown[]) => mockUseInfiniteJournals(...args),
  useDeleteJournal: () => mockUseDeleteJournal(),
  usePostJournal: () => mockUsePostJournal(),
  useReverseJournal: () => ({ mutateAsync: jest.fn(), isPending: false }),
  formatJournalAmount: (v: number | string) => `$${v}`,
  getStatusColor: () => '',
  calculateJournalTotals: () => ({ totalDebit: '0', totalCredit: '0' }),
  isJournalEditable: (j: { isPosted: boolean; sourceType?: string | null }) =>
    !j.isPosted && !j.sourceType,
  isSystemJournal: (j: { sourceType?: string | null }) => !!j.sourceType,
  canReverseJournal: (j: { isPosted: boolean; reversalOfId?: string | null }) =>
    j.isPosted && !j.reversalOfId,
  LEDGER_QUERY_KEYS: [['journals']],
}));

jest.mock('@/lib/hooks/use-table-params', () => ({
  useTableParams: () => ({
    search: '',
    setSearch: jest.fn(),
    sortBy: 'date',
    sortOrder: 'desc',
    setSort: jest.fn(),
    page: 1,
    setPage: jest.fn(),
    limit: 20,
    setLimit: jest.fn(),
    filters: {},
    setFilter: jest.fn(),
    setFilters: jest.fn(),
    queryParams: {},
  }),
}));

jest.mock('@/lib/hooks/use-export-all', () => ({
  useExportAll: () => ({ onExportAll: jest.fn() }),
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

jest.mock('@/lib/hooks/use-bulk-action', () => ({
  useBulkAction: () => ({ execute: jest.fn(), isLoading: false }),
}));

jest.mock('@/lib/api', () => ({
  journalsApi: {
    bulkDelete: jest.fn(),
    bulkPost: jest.fn(),
  },
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/components/tour/auto-tour-trigger', () => ({
  AutoTourTrigger: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render } = require('@testing-library/react');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JournalsPage = require('./page').default;

const defaultHookReturn = {
  data: [],
  total: 0,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  isFetchingNextPage: false,
  isLoading: false,
  refetch: jest.fn(),
};

describe('JournalsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseInfiniteJournals.mockReturnValue(defaultHookReturn);
    mockUseDeleteJournal.mockReturnValue({ mutateAsync: jest.fn() });
    mockUsePostJournal.mockReturnValue({ mutateAsync: jest.fn() });
  });

  it('renders without crashing with empty data', () => {
    expect(() => render(<JournalsPage />)).not.toThrow();
  });

  it('does not crash when journals have entryDate from transform (regression)', () => {
    mockUseInfiniteJournals.mockReturnValue({
      ...defaultHookReturn,
      data: [
        {
          id: 'jrn-1',
          journalNumber: 'JRN-001',
          date: '2026-03-15T00:00:00.000Z',
          entryDate: '2026-03-15T00:00:00.000Z',
          reference: null,
          notes: null,
          description: null,
          isPosted: false,
          status: 'DRAFT',
          organizationId: 'org-1',
          createdAt: '2026-03-15T00:00:00.000Z',
          updatedAt: '2026-03-15T00:00:00.000Z',
          deletedAt: null,
          lines: [
            { accountId: 'acc-1', debit: '500', credit: '0' },
            { accountId: 'acc-2', debit: '0', credit: '500' },
          ],
        },
      ],
      total: 1,
    });
    expect(() => render(<JournalsPage />)).not.toThrow();
  });

  it('shows loading state without crashing', () => {
    mockUseInfiniteJournals.mockReturnValue({ ...defaultHookReturn, isLoading: true });
    expect(() => render(<JournalsPage />)).not.toThrow();
  });
});
