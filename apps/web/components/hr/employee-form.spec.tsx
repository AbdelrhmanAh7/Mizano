/**
 * Regression tests for EmployeeForm.
 *
 * Errors 5-7: "Invalid time value" from date-fns format()
 *   Root cause: when employee.joiningDate is null/undefined/empty-string,
 *   `new Date(null)` returns the epoch (Jan 1 1970) and `new Date(undefined)` /
 *   `new Date('')` return Invalid Date. An Invalid Date object is truthy, so the
 *   guard `form.watch('joiningDate') ? format(...) : 'Pick a date'` evaluates the
 *   format() branch, which throws RangeError: Invalid time value.
 *   Fix: guard defaultValues with `employee.joiningDate ? new Date(...) : new Date()`
 *        and use `isValid()` before calling format() in JSX.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePathname: () => '/hr/employees/new',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseCreateEmployee = jest.fn();
const mockUseUpdateEmployee = jest.fn();

jest.mock('@/lib/hooks/use-hr', () => ({
  useCreateEmployee: () => mockUseCreateEmployee(),
  useUpdateEmployee: () => mockUseUpdateEmployee(),
}));

// Minimal stub for PhoneInput so it doesn't crash in test environment
jest.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
  }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { EmployeeForm } from './employee-form';
import type { Employee } from '@/lib/hooks/use-hr';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultMutation = { mutateAsync: jest.fn(), isPending: false };

const makeEmployee = (overrides?: Partial<Employee>): Employee => ({
  id: 'emp-001',
  employeeNumber: 'EMP-001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: null,
  joiningDate: '2024-01-15T00:00:00Z',
  departmentId: null,
  jobTitle: 'Engineer',
  basicSalary: '5000',
  allowances: null,
  deductions: null,
  bankName: null,
  bankAccountNumber: null,
  taxId: null,
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmployeeForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCreateEmployee.mockReturnValue(defaultMutation);
    mockUseUpdateEmployee.mockReturnValue(defaultMutation);
  });

  it('renders create form without crashing', () => {
    expect(() => render(<EmployeeForm />)).not.toThrow();
  });

  it('renders edit form with valid employee without crashing', () => {
    expect(() => render(<EmployeeForm employee={makeEmployee()} />)).not.toThrow();
  });

  // ── joiningDate Invalid time value regressions ──────────────────────────

  it('does not crash when joiningDate is null (regression: Invalid time value)', () => {
    expect(() =>
      render(<EmployeeForm employee={makeEmployee({ joiningDate: null as unknown as string })} />),
    ).not.toThrow();
  });

  it('does not crash when joiningDate is undefined', () => {
    expect(() =>
      render(
        <EmployeeForm employee={makeEmployee({ joiningDate: undefined as unknown as string })} />,
      ),
    ).not.toThrow();
  });

  it('does not crash when joiningDate is an empty string', () => {
    expect(() =>
      render(<EmployeeForm employee={makeEmployee({ joiningDate: '' })} />),
    ).not.toThrow();
  });

  it('shows the formatted joining date when joiningDate is valid', () => {
    render(<EmployeeForm employee={makeEmployee({ joiningDate: '2024-06-01T00:00:00Z' })} />);
    // The calendar button should show a formatted date, not 'Pick a date'
    const button = screen.getByRole('button', { name: /june/i });
    expect(button).toBeInTheDocument();
  });

  it('shows a formatted date (not "Pick a date") when joiningDate is null — defaults to today', () => {
    render(<EmployeeForm employee={makeEmployee({ joiningDate: null as unknown as string })} />);
    // When joiningDate is null the form defaults to new Date() (today) — a valid date is shown
    expect(screen.queryByText('Pick a date')).not.toBeInTheDocument();
  });

  // ── allowances / deductions conversion ────────────────────────────────────

  it('does not crash when allowances is a plain object {}', () => {
    expect(() =>
      render(<EmployeeForm employee={makeEmployee({ allowances: {} as unknown as null })} />),
    ).not.toThrow();
  });

  it('does not crash when allowances is null', () => {
    expect(() =>
      render(<EmployeeForm employee={makeEmployee({ allowances: null })} />),
    ).not.toThrow();
  });
});
