/**
 * Tests for CustomerForm accessibility, localization, and payload structure (#373).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import enSales from '@/messages/en/sales.json';
import arSales from '@/messages/ar/sales.json';
import enCommon from '@/messages/en/common.json';
import arCommon from '@/messages/ar/common.json';
import { Customer } from '@/lib/hooks/use-customers';

let testLocale = 'en';

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const messages = (
      testLocale === 'ar'
        ? namespace === 'common'
          ? arCommon
          : arSales
        : namespace === 'common'
          ? enCommon
          : enSales
    ) as Record<string, unknown>;
    return (key: string) => {
      const parts = key.split('.');
      let current: unknown = messages;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof current === 'string' ? current : key;
    };
  },
}));

// Country/city/phone pickers and the Radix select need a real browser; plain stubs are enough here.
jest.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({ id, 'aria-label': ariaLabel }: { id?: string; 'aria-label'?: string }) => (
    <input id={id} aria-label={ariaLabel} />
  ),
}));
jest.mock('@/components/ui/country-select', () => ({
  CountrySelect: ({ id, 'aria-label': ariaLabel }: { id?: string; 'aria-label'?: string }) => (
    <input id={id} aria-label={ariaLabel} />
  ),
}));
jest.mock('@/components/ui/city-select', () => ({
  CitySelect: ({ id, 'aria-label': ariaLabel }: { id?: string; 'aria-label'?: string }) => (
    <input id={id} aria-label={ariaLabel} />
  ),
}));
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    'aria-label'?: string;
  }) => <div aria-label={ariaLabel}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

import { buildCustomerPayload, CustomerForm } from './customer-form';

const FLAT_KEYS = [
  'billingStreet',
  'billingCity',
  'billingState',
  'billingPostalCode',
  'billingCountry',
  'shippingStreet',
  'shippingCity',
  'shippingState',
  'shippingPostalCode',
  'shippingCountry',
];

describe('CustomerForm buildCustomerPayload (#373)', () => {
  it('nests the addresses and keeps notes, with no flat address keys', () => {
    const payload = buildCustomerPayload({
      name: 'Nile Traders',
      email: 'billing@nile.example',
      phone: '+201000000215',
      currency: 'EGP',
      paymentTerms: 30,
      notes: 'Prefers invoices by e-mail',
      billingAddress: {
        street: '1 Nile St',
        city: 'Cairo',
        state: '',
        postalCode: '11511',
        country: 'EG',
      },
      shippingAddress: {
        street: '9 Port Rd',
        city: 'Alexandria',
        state: '',
        postalCode: '',
        country: 'EG',
      },
    });

    expect(payload).toEqual({
      name: 'Nile Traders',
      displayName: null,
      email: 'billing@nile.example',
      phone: '+201000000215',
      currency: 'EGP',
      taxId: null,
      paymentTerms: 30,
      notes: 'Prefers invoices by e-mail',
      billingAddress: {
        street: '1 Nile St',
        city: 'Cairo',
        state: null,
        postalCode: '11511',
        country: 'EG',
      },
      shippingAddress: {
        street: '9 Port Rd',
        city: 'Alexandria',
        state: null,
        postalCode: null,
        country: 'EG',
      },
    });
    for (const key of FLAT_KEYS) expect(payload).not.toHaveProperty(key);
  });

  it('sends empty inputs as null so an edit can clear them', () => {
    const payload = buildCustomerPayload({
      name: 'Nile Traders',
      email: '',
      currency: 'USD',
      notes: '',
      billingAddress: { street: '', city: '' },
    });

    expect(payload).toMatchObject({
      email: null,
      notes: null,
      paymentTerms: 0,
      billingAddress: { street: null, city: null, state: null, postalCode: null, country: null },
      shippingAddress: { street: null, city: null, state: null, postalCode: null, country: null },
    });
  });
});

describe('CustomerForm localization and accessible labels (#373 AC1, AC2)', () => {
  beforeEach(() => {
    testLocale = 'en';
  });

  it('renders single-locale English labels without bilingual keyword stacking or invalid phrases (AC1)', () => {
    testLocale = 'en';
    const { container } = render(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    // English labels and aria-labels are single-locale clean phrases
    expect(screen.getByLabelText('Customer Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing Street')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping Street')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing City')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping City')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing Postal Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping Postal Code')).toBeInTheDocument();

    // No bilingual keyword stacking (slash-delimited multilingual text)
    const elementsWithAria = container.querySelectorAll('[aria-label]');
    elementsWithAria.forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      expect(label).not.toContain(' / ');
      expect(label).not.toContain('مشاركة');
    });

    expect(container.textContent).not.toContain('مشاركة');
  });

  it('renders correct MSA Arabic labels in Arabic locale without mistranslated "مشاركة" fragments (AC2)', () => {
    testLocale = 'ar';
    const { container } = render(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    // Arabic labels use correct MSA terminology
    expect(screen.getByLabelText('اسم العميل')).toBeInTheDocument();
    expect(screen.getByLabelText('شارع الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('دولة الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('مدينة الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('الرمز البريدي لعنوان الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('شارع الشحن')).toBeInTheDocument();
    expect(screen.getByLabelText('دولة الشحن')).toBeInTheDocument();
    expect(screen.getByLabelText('مدينة الشحن')).toBeInTheDocument();
    expect(screen.getByLabelText('الرمز البريدي لعنوان الشحن')).toBeInTheDocument();

    // Under no circumstances should the mistranslated "مشاركة" fragments exist
    const elementsWithAria = container.querySelectorAll('[aria-label]');
    elementsWithAria.forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      expect(label).not.toContain(' / ');
      expect(label).not.toContain('مشاركة');
      expect(label).not.toContain('مشاركة الشارع');
      expect(label).not.toContain('مشاركة الدولة');
      expect(label).not.toContain('مشاركة المدينة');
      expect(label).not.toContain('مشاركة البريد');
    });

    expect(container.textContent).not.toContain('مشاركة');
  });
});

describe('CustomerForm submit button and action accessibility (#373 AC3, AC4)', () => {
  it('differentiates create vs update in English and Arabic on submit button (AC3)', () => {
    // English create
    testLocale = 'en';
    const { rerender } = render(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);
    const submitBtn = screen.getByRole('button', { name: 'Create Customer' });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toHaveAttribute('aria-label', 'Create Customer');

    // English update
    rerender(
      <CustomerForm
        customer={{ id: 'c-1', name: 'Existing Customer' } as unknown as Customer}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const updateBtn = screen.getByRole('button', { name: 'Update Customer' });
    expect(updateBtn).toBeInTheDocument();
    expect(updateBtn).toHaveAttribute('aria-label', 'Update Customer');

    // English saving
    rerender(
      <CustomerForm
        customer={{ id: 'c-1', name: 'Existing Customer' } as unknown as Customer}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        isSubmitting={true}
      />,
    );
    expect(screen.getByRole('button', { name: 'Saving...' })).toHaveAttribute(
      'aria-label',
      'Saving...',
    );

    // Arabic create
    testLocale = 'ar';
    rerender(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);
    const arCreateBtn = screen.getByRole('button', { name: 'إنشاء عميل' });
    expect(arCreateBtn).toBeInTheDocument();
    expect(arCreateBtn).toHaveAttribute('aria-label', 'إنشاء عميل');

    // Arabic update
    rerender(
      <CustomerForm
        customer={{ id: 'c-1', name: 'عميل حالي' } as unknown as Customer}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const arUpdateBtn = screen.getByRole('button', { name: 'تحديث العميل' });
    expect(arUpdateBtn).toBeInTheDocument();
    expect(arUpdateBtn).toHaveAttribute('aria-label', 'تحديث العميل');

    // Arabic saving
    rerender(
      <CustomerForm
        customer={{ id: 'c-1', name: 'عميل حالي' } as unknown as Customer}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        isSubmitting={true}
      />,
    );
    expect(screen.getByRole('button', { name: 'جاري الحفظ...' })).toHaveAttribute(
      'aria-label',
      'جاري الحفظ...',
    );
  });

  it('uses consistent translation key for copy from billing button text and aria-label (AC4)', () => {
    testLocale = 'en';
    const { rerender } = render(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);
    const enCopyBtn = screen.getByRole('button', { name: 'Copy from Billing' });
    expect(enCopyBtn).toHaveAttribute('aria-label', 'Copy from Billing');
    expect(enCopyBtn).toHaveTextContent('Copy from Billing');

    testLocale = 'ar';
    rerender(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);
    const arCopyBtn = screen.getByRole('button', { name: 'نسخ من الفوترة' });
    expect(arCopyBtn).toHaveAttribute('aria-label', 'نسخ من الفوترة');
    expect(arCopyBtn).toHaveTextContent('نسخ من الفوترة');
  });

  it('submits nested address payload when form is submitted (AC6)', async () => {
    testLocale = 'en';
    const onSubmit = jest.fn();
    render(<CustomerForm onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Customer Name'), {
      target: { value: 'Nile Traders' },
    });
    fireEvent.change(document.getElementById('billingStreet') as HTMLElement, {
      target: { value: '1 Nile St' },
    });
    fireEvent.change(document.getElementById('notes') as HTMLElement, {
      target: { value: 'Prefers e-mail' },
    });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      name: 'Nile Traders',
      notes: 'Prefers e-mail',
      billingAddress: { street: '1 Nile St' },
    });
    for (const key of FLAT_KEYS) expect(payload).not.toHaveProperty(key);
  });
});
