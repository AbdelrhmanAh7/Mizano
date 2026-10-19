import { buildCustomerPayload, buildAddressPayload, CustomerFormInput } from './customer-payload';
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

  it('AC2: leaves out empty and whitespace-only strings as undefined (not null)', () => {
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

    expect(payload.displayName).toBeUndefined();
    expect(payload.email).toBeUndefined();
    expect(payload.phone).toBeUndefined();
    expect(payload.taxId).toBeUndefined();

    expect(payload.billingAddress).toEqual({
      street: '789 Tahrir Sq',
      city: 'Cairo',
      country: 'EG',
    });
    expect(payload.billingAddress).not.toHaveProperty('state');
    expect(payload.billingAddress).not.toHaveProperty('postalCode');
    expect((payload.billingAddress as unknown as Record<string, unknown>).state).toBeUndefined();
    expect(
      (payload.billingAddress as unknown as Record<string, unknown>).postalCode,
    ).toBeUndefined();
  });

  it('AC3: drops an address completely when all its fields are blank', () => {
    const input: CustomerFormInput = {
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

    const payload = buildCustomerPayload(input);

    expect(payload.billingAddress).toBeUndefined();
    expect(payload.shippingAddress).toBeUndefined();
    expect(payload).not.toHaveProperty('billingAddress');
    expect(payload).not.toHaveProperty('shippingAddress');
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

  it('AC5: trims string fields and excludes empty optional priceListId', () => {
    const payload = buildCustomerPayload({
      name: '  Trimmed Name  ',
      priceListId: '   ',
    });
    expect(payload.name).toBe('Trimmed Name');
    expect(payload.priceListId).toBeUndefined();
    expect(payload).not.toHaveProperty('priceListId');

    const payloadWithPriceList = buildCustomerPayload({
      name: 'Price List Customer',
      priceListId: 'pl-123',
    });
    expect(payloadWithPriceList.priceListId).toBe('pl-123');
  });
});

describe('buildAddressPayload', () => {
  it('returns undefined for undefined or null address input', () => {
    expect(buildAddressPayload(undefined)).toBeUndefined();
    expect(buildAddressPayload(null)).toBeUndefined();
  });

  it('returns undefined when all fields are empty or whitespace', () => {
    expect(
      buildAddressPayload({
        street: '',
        city: '   ',
        state: undefined,
        postalCode: null,
        country: '',
      }),
    ).toBeUndefined();
  });

  it('returns trimmed non-empty fields only', () => {
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
      country: 'EG',
    });
  });
});

describe('customer-form export', () => {
  it('AC6: customer-form exports buildCustomerPayload matching customer-payload', () => {
    expect(buildCustomerPayloadFromForm).toBe(buildCustomerPayload);
  });
});
