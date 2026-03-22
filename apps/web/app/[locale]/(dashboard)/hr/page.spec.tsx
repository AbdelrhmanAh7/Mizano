/**
 * Regression tests for HRPage.
 *
 * Error 1-3: "Cannot read properties of undefined (reading 'id')"
 *   Root cause: page typed departments as `{ _count: { id: number } }` but the API
 *   (getDepartmentSummary service) returns `{ department: string; count: number }` —
 *   a simplified shape with a flat `count` field.  Reading `dept._count.id` therefore
 *   throws TypeError: Cannot read properties of undefined (reading 'id') on every
 *   render when department data is present.
 *   Fix: update type annotation and all usages to `dept.count`.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/hr',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseEmployees = jest.fn();
const mockUsePayrollRuns = jest.fn();
const mockUseDepartmentSummary = jest.fn();

jest.mock('@/lib/hooks/use-hr', () => ({
  useEmployees: (...args: unknown[]) => mockUseEmployees(...args),
  usePayrollRuns: (...args: unknown[]) => mockUsePayrollRuns(...args),
  useDepartmentSummary: () => mockUseDepartmentSummary(),
  formatCurrency: (v: number | string) => `$${v}`,
  getPayrollStatusLabel: (s: string) => s,
  getPayrollStatusColor: () => '',
  getMonthName: (m: number) => ['', 'January', 'February', 'March'][m] ?? `Month${m}`,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import HRPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderPage = () => render(<HRPage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HRPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEmployees.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false });
    mockUsePayrollRuns.mockReturnValue({
      data: { data: [], meta: { total: 0 } },
      isLoading: false,
    });
    mockUseDepartmentSummary.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('renders without crashing with empty data', () => {
    expect(() => renderPage()).not.toThrow();
  });

  // ── dept._count.id regressions ───────────────────────────────────────────

  it('does not crash when deptSummary has flat count shape (regression: _count.id undefined)', () => {
    // API returns { department, count } — NOT { department, _count: { id } }
    mockUseDepartmentSummary.mockReturnValue({
      data: [
        { department: 'Engineering', count: 5 },
        { department: 'HR', count: 3 },
      ],
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders department names from flat count shape', () => {
    mockUseDepartmentSummary.mockReturnValue({
      data: [{ department: 'Engineering', count: 4 }],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  it('does not crash when deptSummary is null/undefined', () => {
    mockUseDepartmentSummary.mockReturnValue({ data: null, isLoading: false });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when deptSummary is an empty array', () => {
    mockUseDepartmentSummary.mockReturnValue({ data: [], isLoading: false });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders with employees data without crashing', () => {
    mockUseEmployees.mockReturnValue({
      data: {
        data: [
          { id: 'e1', firstName: 'John', lastName: 'Doe', status: 'ACTIVE', basicSalary: '5000' },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders with payroll runs without crashing', () => {
    mockUsePayrollRuns.mockReturnValue({
      data: {
        data: [
          { id: 'pr1', month: 3, year: 2026, status: 'DRAFT', totalNet: '10000', employeeCount: 5 },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('shows loading skeletons while data is loading', () => {
    mockUseEmployees.mockReturnValue({ data: undefined, isLoading: true });
    mockUsePayrollRuns.mockReturnValue({ data: undefined, isLoading: true });
    mockUseDepartmentSummary.mockReturnValue({ data: undefined, isLoading: true });
    expect(() => renderPage()).not.toThrow();
  });
});
