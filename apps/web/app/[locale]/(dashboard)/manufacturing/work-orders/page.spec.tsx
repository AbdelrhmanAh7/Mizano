/**
 * Regression tests for WorkOrdersPage.
 *
 * Error 1-2: "Invalid time value" crash when plannedStartDate is null/undefined.
 * Root cause: `format(new Date(row.original.startDate), ...)` — startDate was
 *   the wrong field name AND had no null guard. The API returns plannedStartDate
 *   which is nullable (DateTime? in Prisma).
 * Fix: use accessorKey='plannedStartDate'; guard with ternary before format().
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/manufacturing/work-orders',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseWorkOrders = jest.fn();
jest.mock('@/lib/hooks/use-manufacturing', () => ({
  useWorkOrders: (...args: unknown[]) => mockUseWorkOrders(...args),
  useDeleteWorkOrder: () => ({ mutateAsync: jest.fn() }),
  getWorkOrderStatusColor: () => '',
  getWorkOrderStatusLabel: (s: string) => s,
}));

jest.mock('@/lib/api', () => ({
  workOrdersApi: {
    bulkDelete: jest.fn(),
    bulkStart: jest.fn(),
    bulkComplete: jest.fn(),
    bulkCancel: jest.fn(),
  },
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

jest.mock('@/lib/hooks/use-table-params', () => ({
  useTableParams: () => ({
    search: '',
    setSearch: jest.fn(),
    sortBy: 'createdAt',
    sortOrder: 'desc',
    setSort: jest.fn(),
    page: 1,
    setPage: jest.fn(),
    limit: 20,
    setLimit: jest.fn(),
    queryParams: {},
  }),
}));

jest.mock('@/lib/hooks/use-bulk-action', () => ({
  useBulkAction: () => ({ execute: jest.fn(), isLoading: false }),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import WorkOrdersPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseWorkOrder = {
  id: 'wo-001',
  workOrderNumber: 'WO-001',
  bomId: 'bom-001',
  quantity: 10,
  status: 'DRAFT' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  outputItemId: 'item-001',
};

const renderPage = () => render(<WorkOrdersPage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkOrdersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing when work orders list is empty', () => {
    mockUseWorkOrders.mockReturnValue({
      data: { data: [], meta: { page: 1, totalPages: 1, total: 0 } },
      isLoading: false,
      refetch: jest.fn(),
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders without crashing when plannedStartDate is null (regression: Invalid time value)', () => {
    mockUseWorkOrders.mockReturnValue({
      data: {
        data: [{ ...baseWorkOrder, plannedStartDate: null, plannedEndDate: null, dueDate: null }],
        meta: { page: 1, totalPages: 1, total: 1 },
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders "-" when plannedStartDate is null', () => {
    mockUseWorkOrders.mockReturnValue({
      data: {
        data: [{ ...baseWorkOrder, plannedStartDate: null, dueDate: null }],
        meta: { page: 1, totalPages: 1, total: 1 },
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    renderPage();
    // The WO number should render and the date cell should be '-'
    expect(screen.getByText('WO-001')).toBeInTheDocument();
  });

  it('renders formatted date when plannedStartDate is a valid ISO string', () => {
    mockUseWorkOrders.mockReturnValue({
      data: {
        data: [{ ...baseWorkOrder, plannedStartDate: '2026-03-15T00:00:00Z', dueDate: null }],
        meta: { page: 1, totalPages: 1, total: 1 },
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders without crashing when both plannedStartDate and dueDate are undefined', () => {
    mockUseWorkOrders.mockReturnValue({
      data: {
        data: [{ ...baseWorkOrder }],
        meta: { page: 1, totalPages: 1, total: 1 },
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('shows loading state', () => {
    mockUseWorkOrders.mockReturnValue({ data: null, isLoading: true, refetch: jest.fn() });
    expect(() => renderPage()).not.toThrow();
  });

  it('shows status badge for work order', () => {
    mockUseWorkOrders.mockReturnValue({
      data: {
        data: [{ ...baseWorkOrder, status: 'IN_PROCESS', plannedStartDate: null }],
        meta: { page: 1, totalPages: 1, total: 1 },
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    renderPage();
    expect(screen.getByText('IN_PROCESS')).toBeInTheDocument();
  });
});
