import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvoiceForm, paymentTermsFor } from './invoice-form';
import type { Invoice } from '@/lib/hooks/use-invoices';

jest.mock('next-intl', () => {
  const messages = {
    sales: jest.requireActual('@/messages/en/sales.json'),
    common: jest.requireActual('@/messages/en/common.json'),
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages,
      );
  return {
    useLocale: () => 'en',
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

// A stable result, like React Query's: the form reads the selected customer by id.
const mockCustomer = { data: { id: 'c1', name: 'Nile Co', paymentTerms: 30, currency: 'USD' } };
const mockNoCustomer = { data: undefined };
jest.mock('@/lib/hooks/use-customers', () => ({
  useCustomer: (id?: string) => (id === 'c1' ? mockCustomer : mockNoCustomer),
}));
// The real pickers search the server (see async-combobox.spec).
jest.mock('@/components/shared/party-combobox', () => ({
  CustomerCombobox: ({ value }: { value?: string }) => (
    <button type="button" role="option" aria-selected={value === 'c1'}>
      Nile Co
    </button>
  ),
  ItemCombobox: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
}));
jest.mock('@/lib/hooks/use-organization', () => ({
  ...jest.requireActual('@/lib/hooks/use-organization'),
  useBaseCurrency: () => 'EGP',
}));

// Radix Select does not open in jsdom: render each option as a button wired to onValueChange.
jest.mock('@/components/ui/select', () => {
  const { createContext, useContext } = jest.requireActual<typeof import('react')>('react');
  const Ctx = createContext<{ value?: string; onValueChange?: (v: string) => void }>({});
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children: React.ReactNode;
    }) => <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = useContext(Ctx);
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

const savedInvoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-0001',
  customerId: 'c1',
  date: '2026-10-01T00:00:00.000Z',
  dueDate: '2026-10-16T00:00:00.000Z',
  status: 'DRAFT',
  shippingAmount: '0',
  currencyCode: null,
  reference: 'PO-4411',
  notes: null,
  terms: null,
  lines: [{ description: 'Consulting', quantity: '1', rate: '100', amount: '100' }],
} as unknown as Invoice;

const selectedOption = () =>
  screen
    .getAllByRole('option')
    .filter((o) => o.getAttribute('aria-selected') === 'true')
    .map((o) => o.textContent);

describe('InvoiceForm reference and payment terms (audit B9)', () => {
  it('derives the terms from the two dates, or none for a hand-set due date', () => {
    expect(paymentTermsFor('2026-10-01', '2026-10-16')).toBe('NET_15');
    expect(paymentTermsFor('2026-10-01', '2026-10-01')).toBe('DUE_ON_RECEIPT');
    expect(paymentTermsFor('2026-10-01', '2026-10-10')).toBe('');
  });

  it('reopens a saved invoice with its reference and terms, and saves them again', async () => {
    const onSubmit = jest.fn();
    render(<InvoiceForm invoice={savedInvoice} onSubmit={onSubmit} onCancel={jest.fn()} />);

    const reference = document.querySelector<HTMLInputElement>('input[name="reference"]')!;
    await waitFor(() => expect(reference.value).toBe('PO-4411'));
    expect(selectedOption()).toEqual(expect.arrayContaining(['Nile Co', 'Net 15']));

    fireEvent.change(reference, { target: { value: ' PO-9 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Invoice' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      date: '2026-10-01',
      dueDate: '2026-10-16',
      reference: 'PO-9',
    });
  });

  it('sends null to clear a reference removed while editing', async () => {
    const onSubmit = jest.fn();
    render(<InvoiceForm invoice={savedInvoice} onSubmit={onSubmit} onCancel={jest.fn()} />);
    const reference = document.querySelector<HTMLInputElement>('input[name="reference"]')!;
    await waitFor(() => expect(reference.value).toBe('PO-4411'));
    fireEvent.change(reference, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Invoice' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].reference).toBeNull();
  });
});

describe('InvoiceForm preview currency (audit B5)', () => {
  it("previews in the org base currency, not the customer's USD default", () => {
    render(<InvoiceForm customerId="c1" onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getAllByText(/EGP/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$|USD/)).not.toBeInTheDocument();
  });

  it('previews a saved invoice in its own currency', async () => {
    render(
      <InvoiceForm
        invoice={{ ...savedInvoice, currencyCode: 'SAR' } as Invoice}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect((await screen.findAllByText(/SAR/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/EGP/)).not.toBeInTheDocument();
  });
});
