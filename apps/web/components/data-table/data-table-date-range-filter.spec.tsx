/**
 * Tests for DataTableDateRangeFilter component.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  CalendarIcon: ({ className }: { className?: string }) => (
    <span data-testid="icon-calendar" className={className} />
  ),
  X: ({ className, 'data-testid': testId }: { className?: string; 'data-testid'?: string }) => (
    <span data-testid={testId ?? 'icon-x'} className={className} />
  ),
}));

// Mock UI
jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    className,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}));

// Mock Calendar - renders onSelect callback button for testing
let mockCalendarOnSelect: ((range: { from: Date; to: Date }) => void) | null = null;
jest.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    selected,
  }: {
    mode?: string;
    selected?: { from?: Date; to?: Date };
    onSelect?: (range: { from: Date; to: Date } | undefined) => void;
    numberOfMonths?: number;
    disabled?: object;
  }) => {
    mockCalendarOnSelect = onSelect || null;
    return (
      <div
        data-testid="calendar"
        data-from={selected?.from?.toISOString()}
        data-to={selected?.to?.toISOString()}
      >
        Calendar
      </div>
    );
  },
}));

// Mock Popover - always open for testing
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: React.forwardRef<HTMLElement, { children: React.ReactNode; asChild?: boolean }>(
    ({ children }, ref) => <div ref={ref as React.Ref<HTMLDivElement>}>{children}</div>,
  ),
  PopoverContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
  }) => (
    <div data-testid="popover-content" className={className}>
      {children}
    </div>
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { DataTableDateRangeFilter } from './data-table-date-range-filter';

describe('DataTableDateRangeFilter', () => {
  it('renders placeholder when no value', () => {
    render(<DataTableDateRangeFilter onChange={jest.fn()} placeholder="Pick a date" />);
    expect(screen.getByText('Pick a date')).toBeInTheDocument();
  });

  it('renders default placeholder', () => {
    render(<DataTableDateRangeFilter onChange={jest.fn()} />);
    expect(screen.getByText('Date range')).toBeInTheDocument();
  });

  it('renders the date range when value is provided', () => {
    render(
      <DataTableDateRangeFilter
        value={{ from: new Date('2024-01-15'), to: new Date('2024-03-15') }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
    expect(screen.getByText(/Mar 15, 2024/)).toBeInTheDocument();
  });

  it('renders presets sidebar by default', () => {
    render(<DataTableDateRangeFilter onChange={jest.fn()} />);
    expect(screen.getByText('Quick Select')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('This month')).toBeInTheDocument();
  });

  it('hides presets when showPresets=false', () => {
    render(<DataTableDateRangeFilter onChange={jest.fn()} showPresets={false} />);
    expect(screen.queryByText('Quick Select')).not.toBeInTheDocument();
  });

  it('calls onChange with a date range when a preset is clicked', () => {
    const onChange = jest.fn();
    render(<DataTableDateRangeFilter onChange={onChange} />);
    fireEvent.click(screen.getByText('Today'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
  });

  it('shows clear (X) button when value is provided', () => {
    render(
      <DataTableDateRangeFilter
        value={{ from: new Date('2024-01-01'), to: new Date('2024-01-31') }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId('icon-x')).toBeInTheDocument();
  });

  it('renders Calendar component', () => {
    render(<DataTableDateRangeFilter onChange={jest.fn()} />);
    expect(screen.getByTestId('calendar')).toBeInTheDocument();
  });

  it('calls onChange when Calendar selects a range', () => {
    const onChange = jest.fn();
    render(<DataTableDateRangeFilter onChange={onChange} />);

    // Simulate calendar selection
    if (mockCalendarOnSelect) {
      mockCalendarOnSelect({
        from: new Date('2024-06-01'),
        to: new Date('2024-06-30'),
      });
    }

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date('2024-06-01'),
        to: new Date('2024-06-30'),
      }),
    );
  });

  it('renders all preset options', () => {
    render(<DataTableDateRangeFilter onChange={jest.fn()} />);
    const presetLabels = [
      'Today',
      'Last 7 days',
      'Last 30 days',
      'This month',
      'Last month',
      'This quarter',
      'Last quarter',
      'This year',
    ];
    presetLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });
});
