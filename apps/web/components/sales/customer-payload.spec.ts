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

  it('AC2: sets empty and whitespace-only strings to null (not omitted as undefined) so existing fields can be cleared on edit', () => {
    const input: CustomerFormInput = {
      name: 'Delta Supplies',
      displayName: '   ',
      email: '',
      phone: '   ',
      taxId: '',
      billingAddress: {
        street: '789 Tahrir Sq',
        city: 'Cairo',
        state: '',
        postalCode: '   ',
        country: 'EG',
      },
    };

    const payload = buildCustomerPayload(input);

    // Cleared optional fields must be null (not undefined) so Prisma clears them in the database
    expect(payload.displayName).toBeNull();
    expect(payload.email).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.taxId).toBeNull();

    expect(payload.billingAddress).toEqual({
      street: '789 Tahrir Sq',
      city: 'Cairo',
      state: null,
      postalCode: null,
      country: 'EG',
    });
  });

  it('AC3: handles address clearing with null values and omits undefined addresses', () => {
    // Address provided with all empty fields returns an object with all null fields to clear DB columns
    const inputWithEmptyAddress: CustomerFormInput = {
      name: 'Empty Address Co',
      billingAddress: {
        street: '',
        city: '   ',
        state: '',
        postalCode: '',
        country: '',
      },
      shippingAddress: undefined,
    };

    const payload1 = buildCustomerPayload(inputWithEmptyAddress);
    expect(payload1.billingAddress).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
    expect(payload1.shippingAddress).toBeUndefined();
    expect(payload1).not.toHaveProperty('shippingAddress');

    // Completely undefined address is omitted from payload
    const inputNoAddress: CustomerFormInput = {
      name: 'No Address Co',
    };
    const payload2 = buildCustomerPayload(inputNoAddress);
    expect(payload2.billingAddress).toBeUndefined();
    expect(payload2).not.toHaveProperty('billingAddress');
  });

  it('AC4: drops notes from the API payload (DTO does not accept notes)', () => {
    const input: CustomerFormInput = {
      name: 'Confidential Client',
      notes: 'Customer requires special discount code next month',
    };

    const payload = buildCustomerPayload(input);

    expect(payload).not.toHaveProperty('notes');
    expect((payload as unknown as Record<string, unknown>).notes).toBeUndefined();
  });

  it('AC4: payload contains nested address and no notes key (DTO whitelisting compliant)', () => {
    const input: CustomerFormInput = {
      name: 'Nile Corp',
      notes: 'Internal customer note',
      billingAddress: {
        street: '123 Corniche El Nil',
        city: 'Cairo',
      },
    };

    const payload = buildCustomerPayload(input);

    expect(payload).toEqual({
      name: 'Nile Corp',
      billingAddress: {
        street: '123 Corniche El Nil',
        city: 'Cairo',
        state: null,
        postalCode: null,
        country: null,
      },
    });
    expect(payload).not.toHaveProperty('notes');
    expect((payload as unknown as Record<string, unknown>).notes).toBeUndefined();
  });

  it('AC5: preserves valid numeric paymentTerms including 0 (Due on Receipt)', () => {
    const payloadDueOnReceipt = buildCustomerPayload({
      name: 'Instant Pay Co',
      paymentTerms: 0,
    });
    expect(payloadDueOnReceipt.paymentTerms).toBe(0);

    const payloadNet60 = buildCustomerPayload({
      name: 'Term Client',
      paymentTerms: 60,
    });
    expect(payloadNet60.paymentTerms).toBe(60);

    const payloadNoTerms = buildCustomerPayload({
      name: 'Default Terms',
    });
    expect(payloadNoTerms.paymentTerms).toBeUndefined();
    expect(payloadNoTerms).not.toHaveProperty('paymentTerms');
  });

  it('AC5: trims string fields and handles optional priceListId', () => {
    const payload = buildCustomerPayload({
      name: '  Trimmed Name  ',
      priceListId: '   ',
    });
    expect(payload.name).toBe('Trimmed Name');
    expect(payload.priceListId).toBeNull();

    const payloadWithPriceList = buildCustomerPayload({
      name: 'Price List Customer',
      priceListId: 'pl-123',
    });
    expect(payloadWithPriceList.priceListId).toBe('pl-123');

    const payloadNoPriceList = buildCustomerPayload({
      name: 'No Price List',
    });
    expect(payloadNoPriceList.priceListId).toBeUndefined();
    expect(payloadNoPriceList).not.toHaveProperty('priceListId');
  });
});

describe('buildAddressPayload', () => {
  it('returns undefined for undefined address input', () => {
    expect(buildAddressPayload(undefined)).toBeUndefined();
  });

  it('returns all null fields for null address input to clear existing address', () => {
    expect(buildAddressPayload(null)).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
  });

  it('returns all null fields when all fields are empty or whitespace', () => {
    expect(
      buildAddressPayload({
        street: '',
        city: '   ',
        state: undefined,
        postalCode: null,
        country: '',
      }),
    ).toEqual({
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
  });

  it('returns trimmed non-empty fields and null for blank fields', () => {
    expect(
      buildAddressPayload({
        street: '  10th of Ramadan St  ',
        city: 'Giza',
        state: '',
        postalCode: undefined,
        country: '  EG  ',
      }),
    ).toEqual({
      street: '10th of Ramadan St',
      city: 'Giza',
      state: null,
      postalCode: null,
      country: 'EG',
    });
  });
});

describe('clearableString', () => {
  it('returns undefined when input is undefined', () => {
    expect(clearableString(undefined)).toBeUndefined();
  });

  it('returns null when input is null, empty string, or whitespace', () => {
    expect(clearableString(null)).toBeNull();
    expect(clearableString('')).toBeNull();
    expect(clearableString('   ')).toBeNull();
  });

  it('returns trimmed string for non-empty input', () => {
    expect(clearableString('  hello  ')).toBe('hello');
  });
});

describe('customer-form export', () => {
  it('AC6: customer-form exports buildCustomerPayload matching customer-payload', () => {
    expect(buildCustomerPayloadFromForm).toBe(buildCustomerPayload);
  });
});
