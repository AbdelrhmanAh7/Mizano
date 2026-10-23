import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BillForm, BillFormAccountOption, BillFormItemOption } from './bill-form';

let mockLocale: 'en' | 'ar' = 'en';

jest.mock('next-intl', () => {
  const messages = {
    en: {
      purchases: jest.requireActual('@/messages/en/purchases.json'),
      ai: jest.requireActual('@/messages/en/ai.json'),
    },
    ar: {
      purchases: jest.requireActual('@/messages/ar/purchases.json'),
      ai: jest.requireActual('@/messages/ar/ai.json'),
    },
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages[mockLocale],
      );
  return {
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, string | number>) =>
        String(lookup(`${namespace}.${key}`) ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values?.[name] ?? ''),
        );
      t.has = (key: string) => typeof lookup(`${namespace}.${key}`) === 'string';
      return t;
    },
  };
});

jest.mock('@/lib/hooks/use-vendors', () => ({
  useVendors: () => ({ data: { data: [{ id: 'vendor-1', name: 'Acme', paymentTerms: 30 }] } }),
}));

// Mock Popover to render content inline for testing
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

// Radix Select mock for Vendor/Currency/Project
jest.mock('@/components/ui/select', () => {
  const { createContext, useContext } = jest.requireActual<typeof import('react')>('react');
  const SelectContext = createContext<{ value?: string; onValueChange?: (v: string) => void }>({});
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children: React.ReactNode;
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = useContext(SelectContext);
      return (
        <button
          type="button"
          role="option"
          aria-selected={ctx.value === value}
          onClick={() => ctx.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

const accountsPage1: BillFormAccountOption[] = [
  { id: 'acc-cash', code: '1000', name: 'Cash', type: 'ASSET' },
  { id: 'acc-rent', code: '6100', name: 'Rent Expense', type: 'EXPENSE' },
  { id: 'acc-supplies', code: '6200', name: 'Office Supplies', type: 'EXPENSE' },
  { id: 'acc-sales', code: '4000', name: 'Sales', type: 'REVENUE' },
];

const accountsPage2: BillFormAccountOption[] = [
  { id: 'acc-utilities', code: '6300', name: 'Electricity & Water', type: 'EXPENSE' },
  { id: 'acc-software', code: '6400', name: 'Software Subscriptions', type: 'EXPENSE' },
];

const itemsPage1: BillFormItemOption[] = [
  {
    id: 'item-paper',
    name: 'Paper',
    sku: 'P-1',
    costPrice: '25',
    purchaseAccountId: 'acc-supplies',
  },
  {
    id: 'item-service',
    name: 'Consulting',
    sku: 'S-1',
    costPrice: '100',
    purchaseAccountId: null,
  },
];

const itemsPage2: BillFormItemOption[] = [
  {
    id: 'item-server',
    name: 'Cloud Server',
    sku: 'CS-99',
    costPrice: '500',
    purchaseAccountId: 'acc-software',
    purchaseAccount: {
      id: 'acc-software',
      code: '6400',
      name: 'Software Subscriptions',
      type: 'EXPENSE',
    },
  },
];

function setupFetchers() {
  const fetchAccounts = jest
    .fn()
    .mockImplementation(async ({ search, page }: { search?: string; page?: number }) => {
      if (search === 'water' || search === 'utilities') {
        return { data: [accountsPage2[0]], meta: { page: 1, totalPages: 1, total: 1 } };
      }
      if (page === 2) {
        return { data: accountsPage2, meta: { page: 2, totalPages: 2, total: 6 } };
      }
      return { data: accountsPage1, meta: { page: 1, totalPages: 2, total: 6 } };
    });

  const fetchItems = jest
    .fn()
    .mockImplementation(async ({ search, page }: { search?: string; page?: number }) => {
      if (search === 'server') {
        return { data: itemsPage2, meta: { page: 1, totalPages: 1, total: 1 } };
      }
      if (page === 2) {
        return { data: itemsPage2, meta: { page: 2, totalPages: 2, total: 3 } };
      }
      return { data: itemsPage1, meta: { page: 1, totalPages: 2, total: 3 } };
    });

  const fetchAccountById = jest.fn().mockImplementation(async (id: string) => {
    const all = [...accountsPage1, ...accountsPage2];
    return all.find((a) => a.id === id) || null;
  });

  return { fetchAccounts, fetchItems, fetchAccountById };
}

const accountPicker = (line: number) => screen.getByTestId(`line-${line}-account`);
const itemPicker = (line: number) => screen.getByTestId(`line-${line}-item`);

async function renderForm(
  element: React.ReactElement,
  fetchers?: { fetchAccounts?: jest.Mock; fetchItems?: jest.Mock },
) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(element);
  });
  if (fetchers?.fetchAccounts) {
    await waitFor(() =>
      expect(fetchers.fetchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ search: '', page: 1 }),
      ),
    );
  }
  if (fetchers?.fetchItems) {
    await waitFor(() =>
      expect(fetchers.fetchItems).toHaveBeenCalledWith(
        expect.objectContaining({ search: '', page: 1 }),
      ),
    );
  }
  return result;
}

function fillManualLine() {
  fireEvent.change(document.querySelector('input[name="lines.0.description"]')!, {
    target: { value: 'Office rent' },
  });
  fireEvent.change(document.querySelector('input[name="lines.0.rate"]')!, {
    target: { value: '100' },
  });
}

describe('BillForm searchable and page-aware options (#317)', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('AC1: allows searching accounts and selecting an account from search results', async () => {
    const { fetchAccounts, fetchItems, fetchAccountById } = setupFetchers();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        fetchAccounts={fetchAccounts}
        fetchItems={fetchItems}
        fetchAccountById={fetchAccountById}
        defaultVendorId="vendor-1"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
      { fetchAccounts, fetchItems },
    );

    // Wait for initial fetch (empty search, page 1)
    await waitFor(() => {
      expect(fetchAccounts).toHaveBeenCalledWith(expect.objectContaining({ search: '', page: 1 }));
    });

    const searchInput = screen.getByTestId('line-0-account-select-search');
    fireEvent.change(searchInput, { target: { value: 'water' } });

    await waitFor(() => {
      expect(fetchAccounts).toHaveBeenCalledWith(expect.objectContaining({ search: 'water' }));
    });

    const option = await screen.findByRole('option', { name: /Electricity & Water/i });
    fireEvent.click(option);

    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent(
      '6300 · Electricity & Water',
    );
  });

  it('AC1: allows navigating account pages to select a later-page account', async () => {
    const { fetchAccounts, fetchItems, fetchAccountById } = setupFetchers();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        fetchAccounts={fetchAccounts}
        fetchItems={fetchItems}
        fetchAccountById={fetchAccountById}
        defaultVendorId="vendor-1"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // Initial fetch to load totalPages
    await waitFor(() => {
      expect(within(accountPicker(0)).getByRole('button', { name: /Next/i })).toBeInTheDocument();
    });
    const nextBtn = within(accountPicker(0)).getByRole('button', { name: /Next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(fetchAccounts).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });

    const page2Option = await screen.findByRole('option', { name: /Electricity & Water/i });
    fireEvent.click(page2Option);

    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent(
      '6300 · Electricity & Water',
    );
  });

  it('AC2: allows searching items and selecting an item from search results', async () => {
    const { fetchAccounts, fetchItems, fetchAccountById } = setupFetchers();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        fetchAccounts={fetchAccounts}
        fetchItems={fetchItems}
        fetchAccountById={fetchAccountById}
        defaultVendorId="vendor-1"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const itemSearchInput = screen.getByTestId('line-0-item-select-search');
    fireEvent.change(itemSearchInput, { target: { value: 'server' } });

    await waitFor(() => {
      expect(fetchItems).toHaveBeenCalledWith(expect.objectContaining({ search: 'server' }));
    });

    const itemOption = await screen.findByRole('option', { name: /Cloud Server/i });
    fireEvent.click(itemOption);

    expect(within(itemPicker(0)).getByRole('combobox')).toHaveTextContent('Cloud Server');
  });

  it('AC3: preserves the selected account option when subsequent search or page occurs', async () => {
    const { fetchAccounts, fetchItems, fetchAccountById } = setupFetchers();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        fetchAccounts={fetchAccounts}
        fetchItems={fetchItems}
        fetchAccountById={fetchAccountById}
        defaultVendorId="vendor-1"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // Select Rent Expense
    fireEvent.click(within(accountPicker(0)).getByRole('option', { name: /6100 · Rent Expense/i }));
    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');

    // Now search for "water" which returns a completely different list
    const searchInput = screen.getByTestId('line-0-account-select-search');
    fireEvent.change(searchInput, { target: { value: 'water' } });

    await waitFor(() => {
      expect(fetchAccounts).toHaveBeenCalledWith(expect.objectContaining({ search: 'water' }));
    });

    // The selected Rent Expense account option is preserved in the options list!
    expect(
      within(accountPicker(0)).getByRole('option', { name: /6100 · Rent Expense/i }),
    ).toBeInTheDocument();
    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');
  });

  it('AC4: defaults the expense account to the picked item purchase account across pages', async () => {
    const { fetchAccounts, fetchItems, fetchAccountById } = setupFetchers();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        fetchAccounts={fetchAccounts}
        fetchItems={fetchItems}
        fetchAccountById={fetchAccountById}
        defaultVendorId="vendor-1"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // Pick Paper -> defaults to Office Supplies (page 1)
    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: /Paper/i }));
    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent(
      '6200 · Office Supplies',
    );

    // Search and pick Cloud Server (page 2 item with purchaseAccount on page 2)
    const itemSearchInput = screen.getByTestId('line-0-item-select-search');
    fireEvent.change(itemSearchInput, { target: { value: 'server' } });

    await waitFor(() => {
      expect(fetchItems).toHaveBeenCalledWith(expect.objectContaining({ search: 'server' }));
    });

    fireEvent.click(await screen.findByRole('option', { name: /Cloud Server/i }));

    // Cloud Server's purchaseAccount is Software Subscriptions (from page 2)
    await waitFor(() => {
      expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent(
        '6400 · Software Subscriptions',
      );
    });
  });

  it('AC4: drops the item account when switching back to Manual Entry, but keeps a manual account', async () => {
    const { fetchAccounts, fetchItems, fetchAccountById } = setupFetchers();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        fetchAccounts={fetchAccounts}
        fetchItems={fetchItems}
        fetchAccountById={fetchAccountById}
        defaultVendorId="vendor-1"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // Pick Paper (item account: Office Supplies)
    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: /Paper/i }));
    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent(
      '6200 · Office Supplies',
    );

    // Switch back to Manual Entry -> clears item account
    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: /Manual Entry/i }));
    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent(
      'Choose an expense account',
    );

    // Pick a manual account
    fireEvent.click(within(accountPicker(0)).getByRole('option', { name: /6100 · Rent Expense/i }));
    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');

    // Switch to Manual Entry again -> manual account is kept!
    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: /Manual Entry/i }));
    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');
  });

  it('AC5: blocks submit when a line has no expense account and shows validation error', async () => {
    const onSubmit = jest.fn();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        defaultVendorId="vendor-1"
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    fillManualLine();
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));

    expect(await screen.findByText('Line 1: Choose an expense account')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC5: submits successfully when an expense account is selected', async () => {
    const onSubmit = jest.fn();
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        defaultVendorId="vendor-1"
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    fillManualLine();
    fireEvent.click(within(accountPicker(0)).getByRole('option', { name: /6100 · Rent Expense/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      vendorId: 'vendor-1',
      lines: [
        expect.objectContaining({ accountId: 'acc-rent', description: 'Office rent', rate: '100' }),
      ],
    });
  });

  it('AC3: preselects accountId and submits when editing an existing bill', async () => {
    const onSubmit = jest.fn();
    const existingBill = {
      id: 'bill-1',
      billNumber: 'BILL-001',
      vendorId: 'vendor-1',
      date: '2026-10-15T00:00:00Z',
      dueDate: '2026-11-15T00:00:00Z',
      status: 'DRAFT',
      lines: [
        {
          id: 'line-1',
          itemId: '',
          accountId: 'acc-rent',
          description: 'Office rent',
          quantity: 1,
          rate: 500,
          taxRate: 0,
        },
      ],
    } as unknown as Parameters<typeof BillForm>[0]['bill'];

    await renderForm(
      <BillForm
        bill={existingBill}
        accounts={accountsPage1}
        items={itemsPage1}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    expect(within(accountPicker(0)).getByRole('combobox')).toHaveTextContent('6100 · Rent Expense');

    fireEvent.click(screen.getByRole('button', { name: 'Update Bill' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      lines: [
        expect.objectContaining({ accountId: 'acc-rent', description: 'Office rent', rate: '500' }),
      ],
    });
  });

  it('AC6: labels the search, account picker and validation in Arabic', async () => {
    mockLocale = 'ar';
    await renderForm(
      <BillForm
        accounts={accountsPage1}
        items={itemsPage1}
        defaultVendorId="vendor-1"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('حساب المصروف')).toBeInTheDocument();
    expect(screen.getByText('إضافة سطر')).toBeInTheDocument();

    fillManualLine();
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));
    expect(await screen.findByText('السطر 1: اختر حساب المصروف')).toBeInTheDocument();
  });
});
