import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { InvoiceForm } from './invoice-form';
import { CreditNoteForm } from './credit-note-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceStatusBadge, PaymentModeBadge, QuoteStatusBadge } from './status-badge';
import enSales from '@/messages/en/sales.json';
import arSales from '@/messages/ar/sales.json';

let mockLocale: 'en' | 'ar' = 'ar';

jest.mock('next-intl', () => {
  const messages = {
    en: {
      sales: jest.requireActual('@/messages/en/sales.json'),
      common: jest.requireActual('@/messages/en/common.json'),
    },
    ar: {
      sales: jest.requireActual('@/messages/ar/sales.json'),
      common: jest.requireActual('@/messages/ar/common.json'),
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
    useLocale: () => mockLocale,
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

const mockNoCustomer = { data: undefined };
jest.mock('@/lib/hooks/use-customers', () => ({ useCustomer: () => mockNoCustomer }));
// The real pickers search the server (see async-combobox.spec); render their closed label.
jest.mock('@/components/shared/party-combobox', () => {
  const Closed = ({ placeholder, noneLabel }: { placeholder: string; noneLabel?: string }) => (
    <span>{noneLabel ?? placeholder}</span>
  );
  return { CustomerCombobox: Closed, ItemCombobox: Closed };
});
jest.mock('@/lib/hooks/use-organization', () => ({
  ...jest.requireActual('@/lib/hooks/use-organization'),
  useBaseCurrency: () => 'EGP',
}));
jest.mock('@/lib/hooks/use-accounts', () => ({ useAccountsByType: () => ({ data: [] }) }));
let mockOpenInvoices: unknown[] = [];
// The customer's invoices (the credit note form lists them for "original" and "apply to").
jest.mock('@/lib/hooks/use-invoices', () => ({
  useInvoices: () => ({ data: { data: mockOpenInvoices } }),
}));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  creditNotesApi: { refundAccounts: async () => ({ data: [] }) },
}));

/** Visible text that is a run of Latin words, i.e. an untranslated English label. */
const englishText = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('label, button, h3, th, p, span, div'))
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent?.trim() ?? '')
    .filter((text) => /[A-Za-z]{3,}/.test(text) && !/^(PO-001|EGP|USD)/.test(text));

describe('sales forms in Arabic (audit B4)', () => {
  beforeEach(() => {
    mockLocale = 'ar';
  });

  it('renders the invoice form without English labels and translates its validation', async () => {
    const { container } = render(<InvoiceForm onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('بيانات الفاتورة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إنشاء الفاتورة' })).toBeInTheDocument();
    expect(englishText(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الفاتورة' }));
    expect(await screen.findByText('العميل مطلوب')).toBeInTheDocument();
    expect(await screen.findByText('البند 1: الوصف مطلوب')).toBeInTheDocument();
  });

  it('has the same form, validation and toast keys in English and Arabic', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
            keys(v, `${prefix}${k}.`),
          )
        : [prefix.slice(0, -1)];
    for (const section of ['invoices', 'quotes', 'customers', 'payments'] as const) {
      for (const part of ['form', 'validation', 'toast'] as const) {
        const en = (enSales[section] as Record<string, unknown>)[part];
        const ar = (arSales[section] as Record<string, unknown>)[part];
        expect({ section, part, keys: keys(ar).sort() }).toEqual({
          section,
          part,
          keys: keys(en).sort(),
        });
      }
    }
    expect(Object.keys(arSales.lineItems).sort()).toEqual(Object.keys(enSales.lineItems).sort());
    // Detail page, list pages and bulk dialogs too.
    for (const section of ['invoices', 'customers', 'payments'] as const) {
      expect({ section, keys: keys(arSales[section]).sort() }).toEqual({
        section,
        keys: keys(enSales[section]).sort(),
      });
    }
  });

  it('shows status and payment-mode badges in Arabic', () => {
    mockLocale = 'ar';
    render(
      <>
        <InvoiceStatusBadge status="SENT" />
        <QuoteStatusBadge status="ACCEPTED" />
        <PaymentModeBadge mode="BANK_TRANSFER" />
      </>,
    );
    expect(screen.getByText(arSales.invoices.status.sent)).toBeInTheDocument();
    expect(screen.getByText(arSales.quotes.status.accepted)).toBeInTheDocument();
    expect(screen.getByText('تحويل بنكي')).toBeInTheDocument();
    expect(screen.queryByText(/Sent|Accepted|Bank Transfer/)).not.toBeInTheDocument();
  });

  // Manual QA: "Apply to Invoice" listed only *other* open invoices, so the usual case (credit
  // the still-open original invoice, the API's default target) was impossible; the form was
  // also mostly English.
  describe('credit note form', () => {
    const renderForm = () =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <CreditNoteForm
            defaultCustomerId="cust-1"
            defaultInvoiceId="inv-6"
            onSubmit={jest.fn()}
            onCancel={jest.fn()}
          />
        </QueryClientProvider>,
      );

    beforeEach(() => {
      mockOpenInvoices = [
        {
          id: 'inv-6',
          invoiceNumber: 'INV-0006',
          status: 'SENT',
          grandTotal: '342',
          balanceDue: '342',
        },
      ];
    });

    it('offers the still-open original invoice as the invoice to apply the credit to', () => {
      renderForm();
      fireEvent.click(screen.getByText(arSales.creditNotes.form.applyToInvoice));
      const applyOptions = Array.from(document.querySelectorAll('select option')).map(
        (o) => (o as HTMLOptionElement).value,
      );
      expect(applyOptions.filter((v) => v === 'inv-6').length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByText(arSales.creditNotes.form.noOpenInvoicesForCustomer)).toBeNull();
    });

    it('renders in Arabic without English labels and with en/ar key parity', () => {
      const { container } = renderForm();
      expect(screen.getByText('بيانات إشعار الائتمان')).toBeInTheDocument();
      expect(englishText(container).filter((t) => !/INV-0006/.test(t))).toEqual([]);
      expect(Object.keys(arSales.creditNotes.form).sort()).toEqual(
        Object.keys(enSales.creditNotes.form).sort(),
      );
    });
  });
});
