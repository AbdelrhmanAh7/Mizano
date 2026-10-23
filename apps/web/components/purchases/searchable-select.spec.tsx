import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SearchableSelect, SearchableOption } from './searchable-select';

// Mock Popover to always render content inline in jsdom
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: React.forwardRef<HTMLElement, { children: React.ReactNode; asChild?: boolean }>(
    ({ children }, ref) => <div ref={ref as React.Ref<HTMLDivElement>}>{children}</div>,
  ),
  PopoverContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="popover-content" className={className}>
      {children}
    </div>
  ),
}));

describe('SearchableSelect component', () => {
  const initialOptions: SearchableOption[] = [
    { id: 'opt-1', label: '1000 · Cash', sublabel: 'ASSET' },
    { id: 'opt-2', label: '6100 · Rent Expense', sublabel: 'EXPENSE' },
    { id: 'opt-3', label: '6200 · Office Supplies', sublabel: 'EXPENSE' },
  ];

  it('renders with placeholder when no value is selected', () => {
    render(
      <SearchableSelect
        placeholder="Choose an account"
        options={initialOptions}
        onValueChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose an account');
  });

  it('renders selected option label on the trigger', () => {
    render(<SearchableSelect value="opt-2" options={initialOptions} onValueChange={jest.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');
  });

  it('calls onValueChange when an option is clicked', () => {
    const onValueChange = jest.fn();
    render(<SearchableSelect options={initialOptions} onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole('option', { name: /Rent Expense/i }));
    expect(onValueChange).toHaveBeenCalledWith('opt-2', expect.objectContaining({ id: 'opt-2' }));
  });

  it('preserves the selected option even when async search returns different options', async () => {
    const onSearch = jest.fn().mockImplementation(async (query: string) => {
      if (query === 'tax') {
        return {
          options: [{ id: 'opt-tax', label: '2100 · Tax Payable', sublabel: 'LIABILITY' }],
          totalPages: 1,
          total: 1,
        };
      }
      return {
        options: initialOptions,
        totalPages: 1,
        total: 3,
      };
    });

    render(
      <SearchableSelect
        value="opt-2"
        options={initialOptions}
        onSearch={onSearch}
        onValueChange={jest.fn()}
        dataTestId="test-select"
      />,
    );

    // Initial state: opt-2 is selected and visible
    expect(screen.getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');

    // User searches for "tax"
    const searchInput = screen.getByTestId('test-select-search');
    fireEvent.change(searchInput, { target: { value: 'tax' } });

    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith('tax', 1);
    });

    // The new search result (Tax Payable) is present
    await waitFor(() => {
      expect(screen.getByText('2100 · Tax Payable')).toBeInTheDocument();
    });

    // Crucially: opt-2 (Rent Expense) MUST REMAIN PRESERVED in the list!
    expect(
      within(screen.getByRole('listbox')).getByText('6100 · Rent Expense'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');
  });

  it('preserves the selected option across page navigation', async () => {
    const page1Options: SearchableOption[] = [
      { id: 'opt-p1-1', label: 'Account Page 1 - A' },
      { id: 'opt-p1-2', label: 'Account Page 1 - B' },
    ];
    const page2Options: SearchableOption[] = [
      { id: 'opt-p2-1', label: 'Account Page 2 - X' },
      { id: 'opt-p2-2', label: 'Account Page 2 - Y' },
    ];

    const onSearch = jest.fn().mockImplementation(async (_query: string, page: number) => {
      return {
        options: page === 2 ? page2Options : page1Options,
        totalPages: 2,
        total: 4,
      };
    });

    render(
      <SearchableSelect
        value="opt-p1-1"
        options={page1Options}
        onSearch={onSearch}
        onValueChange={jest.fn()}
        dataTestId="page-select"
      />,
    );

    // Initial state: Page 1 selected
    expect(screen.getByRole('combobox')).toHaveTextContent('Account Page 1 - A');

    // Wait for initial fetch to set totalPages > 1
    const nextButton = await screen.findByRole('button', { name: /Next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith('', 2);
    });

    // Page 2 options are rendered
    await waitFor(() => {
      expect(screen.getByText('Account Page 2 - X')).toBeInTheDocument();
    });

    // Page 1 selected option is preserved!
    expect(within(screen.getByRole('listbox')).getByText('Account Page 1 - A')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Account Page 1 - A');
  });

  it('shows emptyText when search has no matching results', async () => {
    const onSearch = jest.fn().mockResolvedValue({
      options: [],
      totalPages: 1,
      total: 0,
    });

    render(
      <SearchableSelect
        onSearch={onSearch}
        emptyText="لم يتم العثور على نتائج"
        onValueChange={jest.fn()}
        dataTestId="empty-select"
      />,
    );

    const searchInput = screen.getByTestId('empty-select-search');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('لم يتم العثور على نتائج')).toBeInTheDocument();
    });
  });

  it('renders localized pagination controls in Arabic', async () => {
    const onSearch = jest.fn().mockResolvedValue({
      options: [{ id: 'opt-ar-1', label: 'حساب 1' }],
      totalPages: 3,
      total: 30,
    });

    render(
      <SearchableSelect
        onSearch={onSearch}
        previousPageText="السابق"
        nextPageText="التالي"
        pageOfText={(p, tp) => `صفحة ${p} من ${tp}`}
        onValueChange={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'السابق' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'التالي' })).toBeInTheDocument();
      expect(screen.getByText('صفحة 1 من 3')).toBeInTheDocument();
    });
  });
});
