/**
 * Regression tests for RunPayrollPage.
 *
 * Error: "allowances.reduce is not a function"
 *   Root cause: `emp.allowances || []` does not guard against truthy non-array values
 *   (e.g. `{}` from a JSON DB field). When `emp.allowances` is an object, `|| []`
 *   does not activate and `.reduce` throws TypeError.
 *   Fix: `Array.isArray(emp.allowances) ? emp.allowances : []` (same for deductions).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/hr/payroll/run',
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
const mockUseRunPayroll = jest.fn();
const mockUseConfirmPayroll = jest.fn();

jest.mock('@/lib/hooks/use-hr', () => ({
  useEmployees: (...args: unknown[]) => mockUseEmployees(...args),
  useRunPayroll: () => mockUseRunPayroll(),
  useConfirmPayroll: () => mockUseConfirmPayroll(),
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import RunPayrollPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultMutations = {
  mutateAsync: jest.fn(),
  isPending: false,
};

const makeEmployee = (overrides?: Record<string, unknown>) => ({
  id: 'emp-001',
  firstName: 'John',
  lastName: 'Doe',
  basicSalary: '5000',
  status: 'ACTIVE',
  ...overrides,
});

const renderPage = () => render(<RunPayrollPage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RunPayrollPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEmployees.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false });
    mockUseRunPayroll.mockReturnValue(defaultMutations);
    mockUseConfirmPayroll.mockReturnValue(defaultMutations);
  });

  it('renders without crashing with empty employee list', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders without crashing with valid employees', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee()], meta: { total: 1 } },
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  // ── allowances.reduce regression ──────────────────────────────────────────

  it('does not crash when allowances is null (regression: allowances.reduce is not a function)', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee({ allowances: null })], meta: { total: 1 } },
      isLoading: false,
    });
    renderPage();
    const btn = screen.getByText('payroll.selectPeriod.generatePreview');
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it('does not crash when allowances is a plain object (truthy non-array)', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee({ allowances: {} })], meta: { total: 1 } },
      isLoading: false,
    });
    renderPage();
    const btn = screen.getByText('payroll.selectPeriod.generatePreview');
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it('does not crash when deductions is null', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee({ deductions: null })], meta: { total: 1 } },
      isLoading: false,
    });
    renderPage();
    const btn = screen.getByText('payroll.selectPeriod.generatePreview');
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it('does not crash when deductions is a plain object (truthy non-array)', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee({ deductions: {} })], meta: { total: 1 } },
      isLoading: false,
    });
    renderPage();
    const btn = screen.getByText('payroll.selectPeriod.generatePreview');
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it('advances to preview step when Generate Preview is clicked with valid employee', () => {
    mockUseEmployees.mockReturnValue({
      data: {
        data: [makeEmployee({ allowances: [{ amount: 500 }], deductions: [{ amount: 200 }] })],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderPage();
    fireEvent.click(screen.getByText('payroll.selectPeriod.generatePreview'));
    expect(screen.getByText('payroll.preview.description')).toBeInTheDocument();
  });

  it('shows loading skeleton when employees are loading', () => {
    mockUseEmployees.mockReturnValue({ data: undefined, isLoading: true });
    expect(() => renderPage()).not.toThrow();
  });
});
