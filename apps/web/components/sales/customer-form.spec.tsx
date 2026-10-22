/**
 * Tests for the customer form payload (#259): the API DTO takes nested
 * billingAddress/shippingAddress objects and rejects unknown keys.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import enSales from '@/messages/en/sales.json';
import arSales from '@/messages/ar/sales.json';
import enCommon from '@/messages/en/common.json';
import arCommon from '@/messages/ar/common.json';

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
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}));

import { buildCustomerPayload, CustomerForm } from './customer-form';
import formPayloadFixture from '../../../../packages/shared-types/fixtures/customer-form-payload.fixture.json';

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

describe('buildCustomerPayload', () => {
  it('nests the addresses and keeps notes, with no flat address keys', () => {
    const payload = buildCustomerPayload({
      name: 'Nile Traders',
      email: 'billing@nile.example',
      phone: '+201000000215',
      currency: 'EGP',
      paymentTerms: 30,
      notes: 'Prefers invoices by e-mail',
      billingAddress: { street: '1 Nile St', city: 'Cairo', postalCode: '11511', country: 'EG' },
      shippingAddress: { street: '9 Port Rd', city: 'Alexandria', country: 'EG' },
    });

    // The API spec validates this same fixture against Create/UpdateCustomerDto.
    expect(payload).toEqual(formPayloadFixture);
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

describe('CustomerForm submit', () => {
  it('passes the nested payload to onSubmit', async () => {
    const onSubmit = jest.fn();
    render(<CustomerForm onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/Customer Name/i), {
      target: { value: 'Nile Traders' },
    });
    fireEvent.change(document.getElementById('billingStreet') as HTMLElement, {
      target: { value: '1 Nile St' },
    });
    fireEvent.change(document.getElementById('shippingStreet') as HTMLElement, {
      target: { value: '9 Port Rd' },
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
      shippingAddress: { street: '9 Port Rd' },
    });
    for (const key of FLAT_KEYS) expect(payload).not.toHaveProperty(key);
  });
});

describe('CustomerForm localization and accessible labels (#259 QA finding)', () => {
  beforeEach(() => {
    testLocale = 'en';
  });

  it('renders single-locale English labels without bilingual keyword stacking or invalid phrases', () => {
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

  it('renders correct MSA Arabic labels in Arabic locale without mistranslated "مشاركة" fragments', () => {
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
