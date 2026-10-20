/**
 * Tests for the customer form payload (#259): the API DTO takes nested
 * billingAddress/shippingAddress objects and rejects unknown keys.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Country/city/phone pickers and the Radix select need a real browser; plain stubs are enough here.
jest.mock('@/components/ui/phone-input', () => ({
  PhoneInput: () => <input aria-label="Phone / الهاتف" />,
}));
jest.mock('@/components/ui/country-select', () => ({
  CountrySelect: () => <span />,
}));
jest.mock('@/components/ui/city-select', () => ({
  CitySelect: () => <span />,
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
