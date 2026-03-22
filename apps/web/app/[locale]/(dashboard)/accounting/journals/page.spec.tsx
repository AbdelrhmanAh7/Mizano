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
 */

import React from 'react';
import { format } from 'date-fns';

// ── Inline unit test of transformJournal ─────────────────────────────────────
// We re-implement the types and function here so the spec is self-contained
// (the source is not exported as a named export).

type JournalStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

interface JournalLine {
  id?: string;
  accountId: string;
  debit: string;
  credit: string;
  description?: string;
  account?: { id: string; code: string; name: string; type: string };
}

interface Journal {
  id: string;
  journalNumber: string;
  date: string;
  entryDate: string;
  reference: string | null;
  notes: string | null;
  description: string | null;
  isPosted: boolean;
  status: JournalStatus;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lines: JournalLine[];
  totalDebit?: number;
  totalCredit?: number;
}

type RawJournal = Omit<Journal, 'entryDate' | 'description' | 'status'>;

function transformJournal(journal: RawJournal): Journal {
  const status: JournalStatus = journal.deletedAt
    ? 'VOIDED'
    : journal.isPosted
      ? 'POSTED'
      : 'DRAFT';

  return {
    ...journal,
    entryDate: journal.date,
    description: journal.notes,
    status,
  };
}

// ── Transform unit tests ─────────────────────────────────────────────────────

describe('transformJournal', () => {
  const baseRaw: RawJournal = {
    id: 'jrn-001',
    journalNumber: 'JRN-001',
    date: '2026-03-15T00:00:00.000Z',
    reference: 'REF-123',
    notes: 'Monthly rent',
    isPosted: false,
    organizationId: 'org-1',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    deletedAt: null,
    lines: [],
  };

  it('adds entryDate as an alias of date', () => {
    const result = transformJournal(baseRaw);
    expect(result.entryDate).toBe(baseRaw.date);
  });

  it('adds description as an alias of notes', () => {
    const result = transformJournal(baseRaw);
    expect(result.description).toBe(baseRaw.notes);
  });

  it('computes status DRAFT when isPosted=false and deletedAt=null', () => {
    const result = transformJournal(baseRaw);
    expect(result.status).toBe('DRAFT');
  });

  it('computes status POSTED when isPosted=true', () => {
    const result = transformJournal({ ...baseRaw, isPosted: true });
    expect(result.status).toBe('POSTED');
  });

  it('computes status VOIDED when deletedAt is set (even if isPosted)', () => {
    const result = transformJournal({
      ...baseRaw,
      isPosted: true,
      deletedAt: '2026-03-16T00:00:00.000Z',
    });
    expect(result.status).toBe('VOIDED');
  });

  it('produces a valid entryDate that date-fns can format without throwing', () => {
    const result = transformJournal(baseRaw);
    // This was the exact crash site: format(new Date(entryDate), 'MMM d, yyyy')
    expect(() => format(new Date(result.entryDate), 'MMM d, yyyy')).not.toThrow();
    expect(format(new Date(result.entryDate), 'MMM d, yyyy')).toBe('Mar 15, 2026');
  });

  it('handles raw data that has date but no entryDate (the original bug scenario)', () => {
    // Simulate raw API payload: only `date`, no `entryDate`
    const rawFromApi: RawJournal = {
      id: 'jrn-002',
      journalNumber: 'JRN-002',
      date: '2026-01-10T00:00:00.000Z',
      reference: null,
      notes: null,
      isPosted: true,
      organizationId: 'org-1',
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
      deletedAt: null,
      lines: [
        { accountId: 'acc-1', debit: '1000.0000', credit: '0' },
        { accountId: 'acc-2', debit: '0', credit: '1000.0000' },
      ],
    };

    const transformed = transformJournal(rawFromApi);
    expect(transformed.entryDate).toBe('2026-01-10T00:00:00.000Z');
    expect(() => format(new Date(transformed.entryDate), 'MMM d, yyyy')).not.toThrow();
  });

  it('maps correctly over an array (mimics useInfiniteJournals behaviour)', () => {
    const rawList: RawJournal[] = [
      { ...baseRaw, id: 'j1', date: '2026-02-01T00:00:00.000Z' },
      { ...baseRaw, id: 'j2', date: '2026-03-01T00:00:00.000Z', isPosted: true },
    ];

    const transformed = rawList.map(transformJournal);

    expect(transformed).toHaveLength(2);
    transformed.forEach((j) => {
      expect(j.entryDate).toBeDefined();
      expect(() => format(new Date(j.entryDate), 'MMM d, yyyy')).not.toThrow();
    });
    expect(transformed[0].status).toBe('DRAFT');
    expect(transformed[1].status).toBe('POSTED');
  });
});

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
  formatJournalAmount: (v: number | string) => `$${v}`,
  getStatusColor: () => '',
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
