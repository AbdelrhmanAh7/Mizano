/**
 * Regression tests for EmployeeDetailPage.
 *
 * Error 1-3: "allowances.reduce is not a function"
 *   Root cause: employee.allowances is stored as a JSON object {} in the DB (Prisma JSON field),
 *   not as an array. `employee.allowances || []` bypasses the guard for truthy objects, so
 *   `.reduce()` throws TypeError.
 *   Fix: `Array.isArray(employee.allowances) ? employee.allowances : []`
 *
 * Preventive fixes also applied:
 *   - joiningDate null guard: `format(new Date(null))` returns epoch; `new Date(undefined)` throws
 *   - firstName/lastName null guards: `employee.firstName[0]` throws when null
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/hr/employees/emp-001',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseEmployee = jest.fn();
const mockUseEmployeePayslips = jest.fn();
const mockUseDeleteEmployee = jest.fn();

jest.mock('@/lib/hooks/use-hr', () => ({
  useEmployee: (...args: unknown[]) => mockUseEmployee(...args),
  useEmployeePayslips: (...args: unknown[]) => mockUseEmployeePayslips(...args),
  useDeleteEmployee: () => mockUseDeleteEmployee(),
  getEmployeeStatusLabel: (s: string) => s,
  getEmployeeStatusColor: () => '',
  formatCurrency: (v: number) => `$${v}`,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import EmployeeDetailPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultMutation = { mutateAsync: jest.fn(), isPending: false };

const makeEmployee = (overrides?: Record<string, unknown>) => ({
  id: 'emp-001',
  employeeNumber: 'EMP-001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: null,
  joiningDate: '2024-01-15T00:00:00Z',
  departmentId: null,
  department: null,
  jobTitle: 'Engineer',
  basicSalary: '5000',
  allowances: null,
  deductions: null,
  bankName: null,
  bankAccountNumber: null,
  taxId: null,
  status: 'ACTIVE' as const,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

const renderPage = () => render(<EmployeeDetailPage params={{ id: 'emp-001' }} />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmployeeDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEmployee.mockReturnValue({ data: undefined, isLoading: true });
    mockUseEmployeePayslips.mockReturnValue({ data: undefined });
    mockUseDeleteEmployee.mockReturnValue(defaultMutation);
  });

  it('renders loading skeleton without crashing', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders "not found" when employee is undefined and not loading', () => {
    mockUseEmployee.mockReturnValue({ data: undefined, isLoading: false });
    expect(() => renderPage()).not.toThrow();
  });

  // ── allowances.reduce regressions ────────────────────────────────────────

  it('does not crash when allowances is null (regression: allowances.reduce is not a function)', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee({ allowances: null }),
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when allowances is a plain object {} (truthy non-array)', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee({ allowances: {} }),
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when deductions is a plain object {}', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee({ deductions: { insurance: 200 } }),
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders correctly when allowances is a valid array', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee({ allowances: [{ name: 'Housing', amount: 500 }] }),
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  // ── joiningDate null guard ────────────────────────────────────────────────

  it('does not crash when joiningDate is null', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee({ joiningDate: null }),
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when joiningDate is undefined', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee({ joiningDate: undefined }),
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  // ── firstName/lastName null guards ────────────────────────────────────────

  it('does not crash when firstName is null', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee({ firstName: null }),
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('shows employee name when data is present', () => {
    mockUseEmployee.mockReturnValue({
      data: makeEmployee(),
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
