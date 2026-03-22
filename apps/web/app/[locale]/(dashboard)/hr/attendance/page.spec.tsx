/**
 * Regression tests for AttendancePage.
 *
 * Error 1-3: "Cannot read properties of undefined (reading '0')"
 *   Root cause: `employee.firstName[0]` / `employee.lastName[0]` in AvatarFallback
 *   throw TypeError when firstName or lastName is null/undefined.
 *   Two locations: detail-column (line ~122) and calendar-grid (line ~350).
 *   Fix: `employee.firstName?.[0] ?? '?'` guards both sites.
 *
 * Error 4: "Converting circular structure to JSON" (HTMLButtonElement)
 *   Root cause: `<Select value={att?.status || ''}>` passes empty-string to
 *   Radix UI Select, which does not accept '' as a controlled value and puts
 *   the component into a broken state. When the broken Select trigger button
 *   ends up in an error path that tries JSON.stringify, the circular reference
 *   between HTMLButtonElement → __reactFiber → stateNode → HTMLButtonElement
 *   causes the unhandledrejection.
 *   Fix: use sentinel value '__none__' and skip mutation when value === '__none__'.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/hr/attendance',
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
const mockUseAttendance = jest.fn();
const mockUseBulkMarkAttendance = jest.fn();

jest.mock('@/lib/hooks/use-hr', () => ({
  useEmployees: (...args: unknown[]) => mockUseEmployees(...args),
  useAttendance: (...args: unknown[]) => mockUseAttendance(...args),
  useBulkMarkAttendance: () => mockUseBulkMarkAttendance(),
  getAttendanceStatusLabel: (s: string) => s,
  getAttendanceStatusColor: () => '',
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import AttendancePage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultBulkMark = { mutateAsync: jest.fn() };

const makeEmployee = (
  overrides?: Partial<{ name: string | null; firstName: string | null; lastName: string | null }>,
) => ({
  id: 'emp-001',
  name: 'John Doe',
  firstName: 'John',
  lastName: 'Doe',
  jobTitle: 'Engineer',
  status: 'ACTIVE',
  ...overrides,
});

const renderPage = () => render(<AttendancePage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AttendancePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEmployees.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false });
    mockUseAttendance.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false });
    mockUseBulkMarkAttendance.mockReturnValue(defaultBulkMark);
  });

  it('renders without crashing with empty data', () => {
    expect(() => renderPage()).not.toThrow();
  });

  // ── Error 1-3 regressions ───────────────────────────────────────────────────

  it('does not crash when employee.firstName is null (regression: Cannot read properties of undefined)', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee({ name: 'John', firstName: null })], meta: { total: 1 } },
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when employee.lastName is null', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee({ name: 'Doe', lastName: null })], meta: { total: 1 } },
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('does not crash when both firstName and lastName are null', () => {
    mockUseEmployees.mockReturnValue({
      data: {
        data: [makeEmployee({ name: null, firstName: null, lastName: null })],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });

  it('shows fallback "?" in AvatarFallback when name is null', () => {
    mockUseEmployees.mockReturnValue({
      data: {
        data: [makeEmployee({ name: null, firstName: null, lastName: null })],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderPage();
    // '??' characters should appear (calendar + detail table avatars)
    const fallbacks = screen.getAllByText('??');
    expect(fallbacks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders valid initials when firstName and lastName are present', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee()], meta: { total: 1 } },
      isLoading: false,
    });
    renderPage();
    const initials = screen.getAllByText('JD');
    expect(initials.length).toBeGreaterThanOrEqual(1);
  });

  // ── Error 4 regression ──────────────────────────────────────────────────────

  it('does not use empty-string as Select value (regression: circular structure JSON error)', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee()], meta: { total: 1 } },
      isLoading: false,
    });
    // No attendance record for this employee — att will be undefined
    mockUseAttendance.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false });

    const { container } = renderPage();

    // Radix Select renders a hidden input with the current value.
    // It must never be "" — should be "__none__" sentinel instead.
    const hiddenInputs = container.querySelectorAll('input[type="hidden"]');
    hiddenInputs.forEach((input) => {
      expect((input as HTMLInputElement).value).not.toBe('');
    });
  });

  it('renders the "Mark" sentinel option in the status Select', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee()], meta: { total: 1 } },
      isLoading: false,
    });
    renderPage();
    expect(screen.getAllByText('attendance.mark').length).toBeGreaterThanOrEqual(1);
  });

  it('renders without crashing with attendance records for the employee', () => {
    mockUseEmployees.mockReturnValue({
      data: { data: [makeEmployee()], meta: { total: 1 } },
      isLoading: false,
    });
    mockUseAttendance.mockReturnValue({
      data: {
        data: [
          {
            id: 'att-001',
            employeeId: 'emp-001',
            date: new Date().toISOString(),
            status: 'PRESENT',
            checkIn: null,
            checkOut: null,
            notes: null,
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    expect(() => renderPage()).not.toThrow();
  });
});
