import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BillForm } from './bill-form';
import enPurchases from '@/messages/en/purchases.json';
import arPurchases from '@/messages/ar/purchases.json';

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

const defaultVendors = [
  { id: 'vendor-1', name: 'Acme', paymentTerms: 30 },
  { id: 'vendor-cod', name: 'Cash Supplier', paymentTerms: 0 },
];
let mockVendors = defaultVendors;
jest.mock('@/lib/hooks/use-vendors', () => ({
  useVendor: (id?: string) => ({ data: mockVendors.find((v) => v.id === id) }),
}));
// The real pickers search the server (see async-combobox.spec): list the records as options.
jest.mock('@/components/shared/party-combobox', () => {
  const Picker = ({
    records,
    value,
    noneLabel,
    onValueChange,
  }: {
    records: Array<{ id: string; name: string }>;
    value?: string;
    noneLabel?: string;
    onValueChange: (id: string, record: unknown) => void;
  }) => (
    <div>
      {noneLabel && (
        <button
          type="button"
          role="option"
          aria-selected={!value}
          onClick={() => onValueChange('', undefined)}
        >
          {noneLabel}
        </button>
      )}
      {records.map((r) => (
        <button
          key={r.id}
          type="button"
          role="option"
          aria-selected={r.id === value}
          onClick={() => onValueChange(r.id, r)}
        >
          {r.name}
        </button>
      ))}
    </div>
  );
  type Props = Omit<React.ComponentProps<typeof Picker>, 'records'>;
  return {
    VendorCombobox: (props: Props) => <Picker records={mockVendors} {...props} />,
    ItemCombobox: (props: Props) => <Picker records={mockItems} {...props} />,
  };
});

const accounts = [
  { id: 'acc-equipment', code: '1500', name: 'Equipment', type: 'ASSET' },
  { id: 'acc-rent', code: '6100', name: 'Rent Expense', type: 'EXPENSE' },
  { id: 'acc-supplies', code: '6200', name: 'Office Supplies', type: 'EXPENSE' },
];
type OptionsState = {
  isSuccess: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
  data?: { data: typeof accounts; vendorDefaultAccountId: string | null };
  refetch: jest.Mock;
};
let mockOptions: OptionsState;
const ready = (vendorDefaultAccountId: string | null = null): OptionsState => ({
  isSuccess: true,
  isError: false,
  isPlaceholderData: false,
  data: { data: accounts, vendorDefaultAccountId },
  refetch: jest.fn(),
});

jest.mock('@/lib/hooks/use-bills', () => ({
  useBillAccountOptions: () => mockOptions,
}));

// Radix Select does not open in jsdom: render each option as a button wired to onValueChange.
jest.mock('@/components/ui/select', () => {
  const { createContext, useContext } = jest.requireActual<typeof import('react')>('react');
  const SelectContext = createContext<{
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
  }>({});
  return {
    Select: ({
      value,
      onValueChange,
      disabled,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      disabled?: boolean;
      children: React.ReactNode;
    }) => (
      <SelectContext.Provider value={{ value, onValueChange, disabled }}>
        {children}
      </SelectContext.Provider>
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
          disabled={ctx.disabled}
          onClick={() => ctx.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

const mockItems = [
  {
    id: 'item-paper',
    name: 'Paper',
    sku: 'P-1',
    costPrice: '25',
    purchaseAccountId: 'acc-supplies',
  },
  { id: 'item-service', name: 'Consulting', sku: 'S-1', costPrice: '100', purchaseAccountId: null },
];
const items = mockItems;

function renderForm(props: Partial<React.ComponentProps<typeof BillForm>> = {}) {
  const onSubmit = jest.fn();
  render(
    <BillForm
      items={items}
      defaultVendorId="vendor-1"
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      {...props}
    />,
  );
  return onSubmit;
}

const accountPicker = (line: number) => screen.getByTestId(`line-${line}-account`);
const itemPicker = (line: number) => screen.getByTestId(`line-${line}-item`);
const selected = (line: number) =>
  within(accountPicker(line))
    .getAllByRole('option')
    .find((o) => o.getAttribute('aria-selected') === 'true')?.textContent ?? null;

function fillLine(index = 0) {
  fireEvent.change(document.querySelector(`input[name="lines.${index}.description"]`)!, {
    target: { value: 'Office rent' },
  });
  fireEvent.change(document.querySelector(`input[name="lines.${index}.rate"]`)!, {
    target: { value: '1000' },
  });
}

describe('BillForm expense account per line (audit B1, #550)', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockOptions = ready();
  });

  it('offers exactly the accounts the API accepts on each line', () => {
    renderForm();
    expect(screen.getAllByText('Expense account').length).toBeGreaterThan(0);
    expect(
      within(accountPicker(0))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['1500 · Equipment', '6100 · Rent Expense', '6200 · Office Supplies']);
  });

  it("defaults the account to the item's purchase account and drops it with the item", () => {
    renderForm();
    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: 'Paper' }));
    expect(selected(0)).toBe('6200 · Office Supplies');

    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: 'Consulting' }));
    expect(selected(0)).toBeNull();
  });

  it("uses the vendor's last-used account for empty and added lines, never over a choice", () => {
    mockOptions = ready('acc-rent');
    renderForm();
    expect(selected(0)).toBe('6100 · Rent Expense');

    fireEvent.click(within(accountPicker(0)).getByRole('option', { name: '1500 · Equipment' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Line/ }));
    expect(selected(0)).toBe('1500 · Equipment');
    expect(selected(1)).toBe('6100 · Rent Expense');
  });

  it('blocks submit while a line has no account', async () => {
    const onSubmit = renderForm();
    fillLine();
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));

    expect(await screen.findByText('Line 1: Choose an expense account')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the account with the exact payload the API test uses', async () => {
    const onSubmit = renderForm();
    fillLine();
    fireEvent.click(within(accountPicker(0)).getByRole('option', { name: '6100 · Rent Expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      vendorId: 'vendor-1',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      reference: null,
      currencyCode: null,
      notes: null,
      projectId: null,
      lines: [
        {
          itemId: null,
          accountId: 'acc-rent',
          description: 'Office rent',
          quantity: '1',
          rate: '1000',
          taxRate: '0',
        },
      ],
    });
  });

  it('refuses a saved account that is no longer offered (deactivated or a control account)', async () => {
    const onSubmit = renderForm({
      bill: {
        id: 'bill-1',
        vendorId: 'vendor-1',
        date: '2026-10-31T00:00:00.000Z',
        dueDate: '2026-11-30T00:00:00.000Z',
        status: 'DRAFT',
        lines: [
          { accountId: 'acc-ap', description: 'Rent', quantity: '1', rate: '100', taxRate: '0' },
        ],
      } as unknown as React.ComponentProps<typeof BillForm>['bill'],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Update Bill' }));

    expect(
      await screen.findByText(/^Line 1: The account must be an active expense or asset account/),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps loading and failure distinct from "no accounts" and blocks submit', () => {
    mockOptions = {
      isSuccess: false,
      isError: false,
      isPlaceholderData: false,
      refetch: jest.fn(),
    };
    const { unmount } = render(
      <BillForm items={items} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Create Bill' })).toBeDisabled();
    expect(screen.getAllByText('Loading accounts…').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('account-options-empty')).not.toBeInTheDocument();
    unmount();

    const refetch = jest.fn();
    mockOptions = { isSuccess: false, isError: true, isPlaceholderData: false, refetch };
    render(<BillForm items={items} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('account-options-error')).toHaveTextContent(
      "Couldn't load the expense accounts.",
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Bill' })).toBeDisabled();
  });

  it('renders in Arabic, including validation messages', async () => {
    mockLocale = 'ar';
    renderForm();
    expect(screen.getByText('بيانات الفاتورة')).toBeInTheDocument();
    expect(screen.getAllByText('حساب المصروف').length).toBeGreaterThan(0);
    fillLine();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الفاتورة' }));
    expect(await screen.findByText('السطر 1: اختر حساب المصروف')).toBeInTheDocument();
    expect(screen.queryByText(/[A-Za-z]{4,} \*/)).not.toBeInTheDocument();
  });

  it('has every bill form, validation and toast key in English and Arabic', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
            keys(v, `${prefix}${k}.`),
          )
        : [prefix.slice(0, -1)];
    for (const section of ['form', 'validation', 'toasts'] as const) {
      expect(keys(arPurchases.bills[section]).sort()).toEqual(
        keys(enPurchases.bills[section]).sort(),
      );
    }
  });
});

describe('BillForm due date (audit B8)', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockOptions = ready();
    mockVendors = defaultVendors;
  });

  const dueDateInput = () => document.querySelector<HTMLInputElement>('input[name="dueDate"]')!;
  const dateInput = () => document.querySelector<HTMLInputElement>('input[name="date"]')!;
  const savedBill = {
    id: 'bill-1',
    vendorId: 'vendor-1',
    date: '2026-10-01T00:00:00.000Z',
    // Set by hand: not the bill date plus the vendor's 30 days.
    dueDate: '2026-10-10T00:00:00.000Z',
    status: 'DRAFT',
    lines: [
      { accountId: 'acc-rent', description: 'Rent', quantity: '1', rate: '100', taxRate: '0' },
    ],
  } as unknown as React.ComponentProps<typeof BillForm>['bill'];

  it('keeps a saved bill due date when the form loads and saves', async () => {
    const onSubmit = renderForm({ bill: savedBill });
    await waitFor(() => expect(dueDateInput().value).toBe('2026-10-10'));
    fireEvent.click(screen.getByRole('button', { name: 'Update Bill' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ date: '2026-10-01', dueDate: '2026-10-10' });
  });

  it('keeps a scanned due date', () => {
    renderForm({
      scanDefaults: { vendorId: 'vendor-1', date: '2026-10-01', dueDate: '2026-10-05' },
    });
    expect(dueDateInput().value).toBe('2026-10-05');
  });

  it('recomputes when the user picks a vendor, with 0-day terms due on receipt', () => {
    renderForm({ bill: savedBill });
    fireEvent.click(screen.getByRole('option', { name: 'Cash Supplier' }));
    expect(dueDateInput().value).toBe('2026-10-01');
  });

  it('recomputes from the vendor terms when the user changes the bill date', () => {
    renderForm({ bill: savedBill });
    fireEvent.change(dateInput(), { target: { value: '2026-11-15' } });
    expect(dueDateInput().value).toBe('2026-12-15');
  });

  it('starts a new bill for a vendor on that vendor terms', () => {
    renderForm({ defaultVendorId: 'vendor-cod' });
    expect(dueDateInput().value).toBe(dateInput().value);
  });
});
