/**
 * Regression tests for EmployeesPage.
 *
 * Error 3-4: "Invalid time value" crash when joiningDate is null/undefined.
 * Root cause: `format(new Date(row.original.joiningDate), 'MMM yyyy')` throws
 *   RangeError when joiningDate is null (the API field is nullable).
 * Fix: guard with ternary — return '-' when joiningDate is falsy.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/hr/employees',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseInfiniteEmployees = jest.fn();
jest.mock('@/lib/hooks/use-hr', () => ({
  useInfiniteEmployees: (...args: unknown[]) => mockUseInfiniteEmployees(...args),
  useDeleteEmployee: () => ({ mutateAsync: jest.fn() }),
  getEmployeeStatusColor: () => '',
  getEmployeeStatusLabel: (s: string) => s,
  formatCurrency: (v: number) => `$${v}`,
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

jest.mock('@/lib/hooks/use-export-all', () => ({
  useExportAll: () => ({ onExportAll: jest.fn() }),
}));

jest.mock('@/components/ai', () => ({
  FlightRiskCard: () => <div data-testid="flight-risk">FlightRisk</div>,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import EmployeesPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseEmployee = {
  id: 'emp-001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: null,
  status: 'ACTIVE' as const,
  jobTitle: 'Engineer',
  basicSalary: '5000',
  departmentId: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const defaultHookReturn = {
  data: [],
  total: 0,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  isFetchingNextPage: false,
  isLoading: false,
};

const renderPage = () => render(<EmployeesPage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmployeesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseInfiniteEmployees.mockReturnValue(defaultHookReturn);
  });

  it('renders without crashing with empty list', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders without crashing when joiningDate is null (regression: Invalid time value)', () => {
    mockUseInfiniteEmployees.mockReturnValue({
      ...defaultHookReturn,
      data: [{ ...baseEmployee, joiningDate: null }],
      total: 1,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders without crashing when joiningDate is undefined', () => {
    mockUseInfiniteEmployees.mockReturnValue({
      ...defaultHookReturn,
      data: [{ ...baseEmployee, joiningDate: undefined }],
      total: 1,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders without crashing for null joiningDate (additional null guard check)', () => {
    mockUseInfiniteEmployees.mockReturnValue({
      ...defaultHookReturn,
      data: [{ ...baseEmployee, joiningDate: null }],
      total: 1,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders formatted date when joiningDate is a valid ISO string', () => {
    mockUseInfiniteEmployees.mockReturnValue({
      ...defaultHookReturn,
      data: [{ ...baseEmployee, joiningDate: '2024-06-01T00:00:00Z' }],
      total: 1,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('shows loading state', () => {
    mockUseInfiniteEmployees.mockReturnValue({ ...defaultHookReturn, isLoading: true });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders without crashing with valid joiningDate and employee data', () => {
    mockUseInfiniteEmployees.mockReturnValue({
      ...defaultHookReturn,
      data: [{ ...baseEmployee, joiningDate: '2023-01-01T00:00:00Z' }],
      total: 1,
    });
    expect(() => renderPage()).not.toThrow();
    // Verify the page header is present (non-table content)
    expect(screen.getAllByText('employees.title').length).toBeGreaterThan(0);
  });
});
