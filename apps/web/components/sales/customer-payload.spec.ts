import {
  buildCustomerPayload,
  buildAddressPayload,
  clearableString,
  CustomerFormInput,
} from './customer-payload';
import { buildCustomerPayload as buildCustomerPayloadFromForm } from './customer-form';

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
  it('AC1: transforms flat form data with nested addresses into DTO structure', () => {
    const input: CustomerFormInput = {
      name: 'Nile Corp',
      displayName: 'Nile Corporation',
      email: 'finance@nile.example',
      phone: '+201000000001',
      currency: 'EGP',
      taxId: 'EG123456789',
      paymentTerms: 30,
      billingAddress: {
        street: '123 Corniche El Nil',
        city: 'Cairo',
        state: 'Cairo Governorate',
        postalCode: '11511',
        country: 'Egypt',
      },
      shippingAddress: {
        street: '456 Port Said St',
        city: 'Alexandria',
        state: 'Alexandria Governorate',
        postalCode: '21500',
        country: 'Egypt',
      },
    };

    const payload = buildCustomerPayload(input);

    expect(payload).toEqual({
      name: 'Nile Corp',
      displayName: 'Nile Corporation',
      email: 'finance@nile.example',
      phone: '+201000000001',
      currency: 'EGP',
      taxId: 'EG123456789',
      paymentTerms: 30,
      billingAddress: {
        street: '123 Corniche El Nil',
        city: 'Cairo',
        state: 'Cairo Governorate',
        postalCode: '11511',
        country: 'Egypt',
      },
      shippingAddress: {
        street: '456 Port Said St',
        city: 'Alexandria',
        state: 'Alexandria Governorate',
        postalCode: '21500',
        country: 'Egypt',
      },
    });

    for (const key of FLAT_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('AC2: converts empty optional strings to null for PATCH deletions', () => {
    const input: CustomerFormInput = {
      name: 'Nile Corp',
      displayName: '',
      email: '   ',
      phone: '',
      taxId: '',
      priceListId: '',
    };

    const payload = buildCustomerPayload(input);

    expect(payload.displayName).toBeNull();
    expect(payload.email).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.taxId).toBeNull();
    expect(payload.priceListId).toBeNull();
  });

  it('AC3: converts empty address fields to null for PATCH deletions', () => {
    const input: CustomerFormInput = {
      name: 'Nile Corp',
      billingAddress: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
      shippingAddress: {
        street: '   ',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
    };

    const payload = buildCustomerPayload(input);

    expect(payload.billingAddress).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
    expect(payload.shippingAddress).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
  });

  it('AC3: handles null address inputs by returning null subfields', () => {
    const input: CustomerFormInput = {
      name: 'Nile Corp',
      billingAddress: null,
      shippingAddress: null,
    };

    const payload = buildCustomerPayload(input);

    expect(payload.billingAddress).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
    expect(payload.shippingAddress).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
  });

  it('AC4: drops notes from payload to prevent 400 Bad Request on whitelisted DTOs', () => {
    const input: CustomerFormInput = {
      name: 'Nile Corp',
      notes: 'Internal VIP customer notes',
    };

    const payload = buildCustomerPayload(input);

    expect(payload).not.toHaveProperty('notes');
  });

  it('AC5: normalizes paymentTerms from number or string', () => {
    const fromNum = buildCustomerPayload({ name: 'Cust A', paymentTerms: 15 });
    expect(fromNum.paymentTerms).toBe(15);

    const fromStr = buildCustomerPayload({ name: 'Cust B', paymentTerms: '45' });
    expect(fromStr.paymentTerms).toBe(45);

    const fromInvalid = buildCustomerPayload({ name: 'Cust C', paymentTerms: 'invalid' });
    expect(fromInvalid.paymentTerms).toBeUndefined();
  });

  it('AC7: preserves undefined for fields not supplied in input', () => {
    const minimal: CustomerFormInput = {
      name: 'Minimal Corp',
    };

    const payload = buildCustomerPayload(minimal);

    expect(payload).toEqual({
      name: 'Minimal Corp',
    });
    expect(payload.displayName).toBeUndefined();
    expect(payload.email).toBeUndefined();
    expect(payload.phone).toBeUndefined();
    expect(payload.taxId).toBeUndefined();
    expect(payload.billingAddress).toBeUndefined();
    expect(payload.shippingAddress).toBeUndefined();
    expect(payload.priceListId).toBeUndefined();
  });
});

describe('buildAddressPayload', () => {
  it('returns undefined when address is undefined', () => {
    expect(buildAddressPayload(undefined)).toBeUndefined();
  });

  it('returns all null subfields when address is null', () => {
    expect(buildAddressPayload(null)).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
  });

  it('trims non-empty values and converts empty strings to null', () => {
    const res = buildAddressPayload({
      street: '  100 Main St  ',
      city: 'Cairo',
      state: '',
      postalCode: null,
      country: undefined,
    });

    expect(res).toEqual({
      street: '100 Main St',
      city: 'Cairo',
      state: null,
      postalCode: null,
      country: null,
    });
  });
});

describe('clearableString', () => {
  it('returns undefined for undefined', () => {
    expect(clearableString(undefined)).toBeUndefined();
  });

  it('returns null for null', () => {
    expect(clearableString(null)).toBeNull();
  });

  it('returns null for empty string or whitespace only', () => {
    expect(clearableString('')).toBeNull();
    expect(clearableString('   \t\n  ')).toBeNull();
  });

  it('returns trimmed string for non-empty text', () => {
    expect(clearableString('  hello  ')).toBe('hello');
  });
});

describe('customer-form export', () => {
  it('AC6: customer-form exports buildCustomerPayload matching customer-payload', () => {
    expect(buildCustomerPayloadFromForm).toBe(buildCustomerPayload);
  });
});
