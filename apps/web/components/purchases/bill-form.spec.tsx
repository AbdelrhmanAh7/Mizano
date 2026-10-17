import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BillForm } from './bill-form';

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

// Radix Select does not open in jsdom: render each option as a button wired to onValueChange.
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

const accounts = [
  { id: 'acc-cash', code: '1000', name: 'Cash', type: 'ASSET' },
  { id: 'acc-rent', code: '6100', name: 'Rent Expense', type: 'EXPENSE' },
  { id: 'acc-supplies', code: '6200', name: 'Office Supplies', type: 'EXPENSE' },
  { id: 'acc-sales', code: '4000', name: 'Sales', type: 'REVENUE' },
];
const items = [
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

function renderForm(onSubmit = jest.fn()) {
  render(
    <BillForm
      accounts={accounts}
      items={items}
      defaultVendorId="vendor-1"
      onSubmit={onSubmit}
      onCancel={jest.fn()}
    />,
  );
  return onSubmit;
}

const accountPicker = (line: number) => screen.getByTestId(`line-${line}-account`);
const itemPicker = (line: number) => screen.getByTestId(`line-${line}-item`);

function fillManualLine() {
  fireEvent.change(document.querySelector('input[name="lines.0.description"]')!, {
    target: { value: 'Office rent' },
  });
  fireEvent.change(document.querySelector('input[name="lines.0.rate"]')!, {
    target: { value: '100' },
  });
}

describe('BillForm expense account per line (#216)', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('lists the expense and asset accounts (never revenue) in each line picker', () => {
    renderForm();
    expect(screen.getAllByText('Expense account').length).toBeGreaterThan(0);
    const options = within(accountPicker(0))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['1000 · Cash', '6100 · Rent Expense', '6200 · Office Supplies']);
  });

  it('defaults the account to the picked item purchase account', () => {
    renderForm();
    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: 'Paper' }));
    expect(
      within(accountPicker(0)).getByRole('option', { name: '6200 · Office Supplies' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('clears accountId when an item without a purchase account is selected', () => {
    renderForm();
    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: 'Paper' }));
    expect(
      within(accountPicker(0)).getByRole('option', { name: '6200 · Office Supplies' }),
    ).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(within(itemPicker(0)).getByRole('option', { name: 'Consulting' }));
    expect(
      within(accountPicker(0)).getByRole('option', { name: '6200 · Office Supplies' }),
    ).toHaveAttribute('aria-selected', 'false');
  });

  it('preselects accountId and submits when editing an existing bill', async () => {
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

    render(
      <BillForm
        bill={existingBill}
        accounts={accounts}
        items={items}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );
    expect(
      within(accountPicker(0)).getByRole('option', { name: '6100 · Rent Expense' }),
    ).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Update Bill' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      lines: [
        expect.objectContaining({ accountId: 'acc-rent', description: 'Office rent', rate: '500' }),
      ],
    });
  });

  it('blocks submit and says "Choose an expense account" when a line has none', async () => {
    const onSubmit = renderForm();
    fillManualLine();
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));
    expect(await screen.findByText('Line 1: Choose an expense account')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a manual line with the chosen account so the bill can be approved', async () => {
    const onSubmit = renderForm();
    fillManualLine();
    fireEvent.click(within(accountPicker(0)).getByRole('option', { name: '6100 · Rent Expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      vendorId: 'vendor-1',
      lines: [
        expect.objectContaining({ accountId: 'acc-rent', description: 'Office rent', rate: '100' }),
      ],
    });
  });

  it('labels the picker and the error in Arabic', async () => {
    mockLocale = 'ar';
    renderForm();
    expect(screen.getAllByText('حساب المصروف').length).toBeGreaterThan(0);
    fillManualLine();
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));
    expect(await screen.findByText('السطر 1: اختر حساب المصروف')).toBeInTheDocument();
  });
});
