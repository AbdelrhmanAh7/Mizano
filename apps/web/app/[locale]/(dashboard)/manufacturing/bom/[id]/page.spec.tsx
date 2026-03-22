/**
 * Regression tests for BOMDetailPage.
 *
 * Errors 1-3: "relatedWorkOrders.map is not a function"
 *   Root cause: workOrderApi.list() returns response.data which is
 *   { data: WorkOrder[], meta: {...} } — the paginated wrapper object, not a flat array.
 *   The component destructured this directly as `relatedWorkOrders`, so:
 *     - `!relatedWorkOrders` → false (truthy object)
 *     - `relatedWorkOrders.length === 0` → undefined === 0 → false
 *   Both guards pass, leading to `relatedWorkOrders.map(...)` which throws because
 *   plain objects do not have a `.map` method.
 *   Fix: normalise with `Array.isArray(workOrdersResponse?.data) ? workOrdersResponse.data
 *        : Array.isArray(workOrdersResponse) ? workOrdersResponse : []`
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: 'bom-001' }),
  usePathname: () => '/manufacturing/bom/bom-001',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseBOM = jest.fn();
const mockUseWorkOrdersByBom = jest.fn();
const mockUseDeleteBOM = jest.fn();

jest.mock('@/lib/hooks/use-manufacturing', () => ({
  useBOM: (...args: unknown[]) => mockUseBOM(...args),
  useDeleteBOM: () => mockUseDeleteBOM(),
  useWorkOrdersByBom: (...args: unknown[]) => mockUseWorkOrdersByBom(...args),
  getBOMStatusColor: () => '',
  getBOMStatusLabel: (s: string) => s,
  getWorkOrderStatusColor: () => '',
  getWorkOrderStatusLabel: (s: string) => s,
  formatCurrency: (v: number | string) => `$${v}`,
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

jest.mock('@/components/manufacturing/bom-form', () => ({
  BOMForm: () => <div data-testid="bom-form">BOMForm</div>,
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import BOMDetailPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultMutation = { mutateAsync: jest.fn(), isPending: false };

const makeBOM = (overrides?: Record<string, unknown>) => ({
  id: 'bom-001',
  name: 'Test BOM',
  status: 'ACTIVE',
  outputQuantity: 10,
  operationsCost: '500',
  components: [],
  outputItem: { id: 'item-001', name: 'Widget', code: 'WGT-001' },
  ...overrides,
});

const makeWorkOrder = (overrides?: Record<string, unknown>) => ({
  id: 'wo-001',
  workOrderNumber: 'WO-001',
  quantity: 5,
  plannedStartDate: '2026-04-01T00:00:00Z',
  status: 'PLANNED',
  ...overrides,
});

const renderPage = () => render(<BOMDetailPage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BOMDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBOM.mockReturnValue({ data: undefined, isLoading: true });
    mockUseWorkOrdersByBom.mockReturnValue({ data: undefined });
    mockUseDeleteBOM.mockReturnValue(defaultMutation);
  });

  it('renders loading skeleton without crashing', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders "not found" when BOM is undefined and not loading', () => {
    mockUseBOM.mockReturnValue({ data: undefined, isLoading: false });
    expect(() => renderPage()).not.toThrow();
  });

  // ── relatedWorkOrders.map regressions ─────────────────────────────────────

  it('does not crash when workOrdersResponse is paginated { data, meta } shape (regression: .map is not a function)', () => {
    mockUseBOM.mockReturnValue({ data: makeBOM(), isLoading: false });
    // API returns wrapped object — NOT a flat array
    mockUseWorkOrdersByBom.mockReturnValue({
      data: { data: [makeWorkOrder()], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } },
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders work order rows when response is paginated { data, meta }', () => {
    mockUseBOM.mockReturnValue({ data: makeBOM(), isLoading: false });
    mockUseWorkOrdersByBom.mockReturnValue({
      data: { data: [makeWorkOrder()], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } },
    });
    renderPage();
    expect(screen.getByText('WO-001')).toBeInTheDocument();
  });

  it('does not crash when workOrdersResponse is a flat array', () => {
    mockUseBOM.mockReturnValue({ data: makeBOM(), isLoading: false });
    mockUseWorkOrdersByBom.mockReturnValue({ data: [makeWorkOrder()] });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when workOrdersResponse is null', () => {
    mockUseBOM.mockReturnValue({ data: makeBOM(), isLoading: false });
    mockUseWorkOrdersByBom.mockReturnValue({ data: null });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when workOrdersResponse is undefined', () => {
    mockUseBOM.mockReturnValue({ data: makeBOM(), isLoading: false });
    mockUseWorkOrdersByBom.mockReturnValue({ data: undefined });
    expect(() => renderPage()).not.toThrow();
  });

  it('shows empty state when work orders array is empty', () => {
    mockUseBOM.mockReturnValue({ data: makeBOM(), isLoading: false });
    mockUseWorkOrdersByBom.mockReturnValue({
      data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } },
    });
    renderPage();
    expect(screen.getByText('bom.noWorkOrders')).toBeInTheDocument();
  });

  it('renders BOM components table when components are present', () => {
    mockUseBOM.mockReturnValue({
      data: makeBOM({
        components: [{ id: 'c1', itemCode: 'RAW-001', itemName: 'Steel', quantity: 2, unit: 'kg' }],
      }),
      isLoading: false,
    });
    mockUseWorkOrdersByBom.mockReturnValue({ data: { data: [], meta: { total: 0 } } });
    renderPage();
    expect(screen.getByText('RAW-001')).toBeInTheDocument();
    expect(screen.getByText('Steel')).toBeInTheDocument();
  });
});
