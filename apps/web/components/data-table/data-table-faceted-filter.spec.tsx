/**
 * Tests for DataTableFacetedFilter component.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Check: ({ className }: { className?: string }) => (
    <span data-testid="icon-check" className={className} />
  ),
  PlusCircle: ({ className }: { className?: string }) => (
    <span data-testid="icon-plus" className={className} />
  ),
}));

// Mock UI components with minimal implementations
jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    className,
    variant,
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: ({ orientation, className }: { orientation?: string; className?: string }) => (
    <hr data-orientation={orientation} className={className} />
  ),
}));

// Mock Popover to always render content
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

// Mock Command components
jest.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input data-testid="command-input" placeholder={placeholder} />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    className?: string;
  }) => (
    <div data-testid="command-item" onClick={onSelect} role="option" aria-selected={false}>
      {children}
    </div>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr data-testid="command-separator" />,
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { DataTableFacetedFilter } from './data-table-faceted-filter';

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PAID', label: 'Paid' },
];

describe('DataTableFacetedFilter', () => {
  it('renders the title on the trigger button', () => {
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={[]}
        onSelectionChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders all options as command items', () => {
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={[]}
        onSelectionChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('shows selected badges when items are selected', () => {
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT']}
        onSelectionChange={jest.fn()}
      />,
    );
    const badges = screen.getAllByTestId('badge');
    const labels = badges.map((b) => b.textContent);
    expect(labels).toContain('Draft');
  });

  it('shows count badge when more than 2 items selected', () => {
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT', 'SENT', 'PAID']}
        onSelectionChange={jest.fn()}
      />,
    );
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('calls onSelectionChange with toggled value (multi-select)', () => {
    const onChange = jest.fn();
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT']}
        onSelectionChange={onChange}
      />,
    );
    // Click "Sent" item
    fireEvent.click(screen.getByText('Sent'));
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['DRAFT', 'SENT']));
  });

  it('removes value when clicking an already-selected option (multi-select)', () => {
    const onChange = jest.fn();
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT', 'SENT']}
        onSelectionChange={onChange}
      />,
    );
    // "Draft" appears in badge and option — target command item
    const items = screen.getAllByTestId('command-item');
    const draftItem = items.find((el) => el.textContent?.includes('Draft'));
    fireEvent.click(draftItem!);
    expect(onChange).toHaveBeenCalledWith(['SENT']);
  });

  it('single-select mode: replaces selection', () => {
    const onChange = jest.fn();
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT']}
        onSelectionChange={onChange}
        singleSelect
      />,
    );
    fireEvent.click(screen.getByText('Sent'));
    expect(onChange).toHaveBeenCalledWith(['SENT']);
  });

  it('single-select mode: deselects when clicking same option', () => {
    const onChange = jest.fn();
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT']}
        onSelectionChange={onChange}
        singleSelect
      />,
    );
    // "Draft" appears both in badge and option — target the command item
    const items = screen.getAllByTestId('command-item');
    const draftItem = items.find((el) => el.textContent?.includes('Draft'));
    fireEvent.click(draftItem!);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows "Clear filters" when items are selected', () => {
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT']}
        onSelectionChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('clears selection when "Clear filters" is clicked', () => {
    const onChange = jest.fn();
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={['DRAFT', 'SENT']}
        onSelectionChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Clear filters'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('renders option count when provided', () => {
    const optionsWithCount = [
      { value: 'DRAFT', label: 'Draft', count: 5 },
      { value: 'PAID', label: 'Paid', count: 12 },
    ];
    render(
      <DataTableFacetedFilter
        title="Status"
        options={optionsWithCount}
        selected={[]}
        onSelectionChange={jest.fn()}
      />,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders search input with correct placeholder', () => {
    render(
      <DataTableFacetedFilter
        title="Status"
        options={STATUS_OPTIONS}
        selected={[]}
        onSelectionChange={jest.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('Search status...')).toBeInTheDocument();
  });
});
