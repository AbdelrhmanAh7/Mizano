import { buildCustomerPayload } from './customer-form';

describe('customer-form payload', () => {
  const baseFormData = {
    name: 'Test Customer',
    displayName: 'Display Name',
    email: 'test@example.com',
    phone: '+15551234567',
    currency: 'USD',
    taxId: 'TAX123',
    paymentTerms: 30,
    notes: 'Some notes',
    billingAddress: {
      street: '123 Main St',
      city: 'Test City',
      state: 'TS',
      postalCode: '12345',
      country: 'US',
    },
    shippingAddress: {
      street: '456 Ship Ave',
      city: 'Ship City',
      state: 'SS',
      postalCode: '67890',
      country: 'US',
    },
  };

  it('sends nested billingAddress and shippingAddress objects, not flat fields', () => {
    const payload = buildCustomerPayload(baseFormData);

    // Should have nested address objects
    expect(payload).toHaveProperty('billingAddress');
    expect(payload).toHaveProperty('shippingAddress');
    expect(typeof payload.billingAddress).toBe('object');
    expect(typeof payload.shippingAddress).toBe('object');
    expect(payload.billingAddress).not.toBeNull();
    expect(payload.shippingAddress).not.toBeNull();

    // Should NOT have flat address fields
    expect(payload).not.toHaveProperty('billingStreet');
    expect(payload).not.toHaveProperty('billingCity');
    expect(payload).not.toHaveProperty('billingState');
    expect(payload).not.toHaveProperty('billingPostalCode');
    expect(payload).not.toHaveProperty('billingCountry');
    expect(payload).not.toHaveProperty('shippingStreet');
    expect(payload).not.toHaveProperty('shippingCity');
    expect(payload).not.toHaveProperty('shippingState');
    expect(payload).not.toHaveProperty('shippingPostalCode');
    expect(payload).not.toHaveProperty('shippingCountry');
  });

  it('includes all address subfields in nested objects', () => {
    const payload = buildCustomerPayload(baseFormData);

    const billing = payload.billingAddress as Record<string, string>;
    const shipping = payload.shippingAddress as Record<string, string>;

    expect(billing.street).toBe('123 Main St');
    expect(billing.city).toBe('Test City');
    expect(billing.state).toBe('TS');
    expect(billing.postalCode).toBe('12345');
    expect(billing.country).toBe('US');

    expect(shipping.street).toBe('456 Ship Ave');
    expect(shipping.city).toBe('Ship City');
    expect(shipping.state).toBe('SS');
    expect(shipping.postalCode).toBe('67890');
    expect(shipping.country).toBe('US');
  });

  it('converts empty optional strings to null for displayName, email, phone, taxId, notes', () => {
    const data = {
      ...baseFormData,
      displayName: '',
      email: '',
      phone: '',
      taxId: '',
      notes: '',
    };

    const payload = buildCustomerPayload(data);

    expect(payload.displayName).toBeNull();
    expect(payload.email).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.taxId).toBeNull();
    expect(payload.notes).toBeNull();
  });

  it('uses null for missing optional fields', () => {
    const data = {
      ...baseFormData,
      displayName: undefined,
      email: undefined,
      phone: undefined,
      taxId: undefined,
      notes: undefined,
    };

    const payload = buildCustomerPayload(data);

    expect(payload.displayName).toBeNull();
    expect(payload.email).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.taxId).toBeNull();
    expect(payload.notes).toBeNull();
  });

  it('defaults paymentTerms to 0 when not provided', () => {
    const data = { ...baseFormData, paymentTerms: undefined };
    const payload = buildCustomerPayload(data);
    expect(payload.paymentTerms).toBe(0);
  });

  it('omits billingAddress when all subfields are empty', () => {
    const data = {
      ...baseFormData,
      billingAddress: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
    };

    const payload = buildCustomerPayload(data);

    // billingAddress should be an object with undefined values (not included in final JSON)
    const billing = payload.billingAddress as Record<string, unknown>;
    expect(billing.street).toBeUndefined();
    expect(billing.city).toBeUndefined();
    expect(billing.state).toBeUndefined();
    expect(billing.postalCode).toBeUndefined();
    expect(billing.country).toBeUndefined();
  });

  it('omits shippingAddress when all subfields are empty', () => {
    const data = {
      ...baseFormData,
      shippingAddress: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
    };

    const payload = buildCustomerPayload(data);

    const shipping = payload.shippingAddress as Record<string, unknown>;
    expect(shipping.street).toBeUndefined();
    expect(shipping.city).toBeUndefined();
    expect(shipping.state).toBeUndefined();
    expect(shipping.postalCode).toBeUndefined();
    expect(shipping.country).toBeUndefined();
  });

  it('handles partial billing address (only some fields filled)', () => {
    const data = {
      ...baseFormData,
      billingAddress: {
        street: '123 Main St',
        city: '',
        state: 'TS',
        postalCode: '',
        country: 'US',
      },
    };

    const payload = buildCustomerPayload(data);

    const billing = payload.billingAddress as Record<string, string | undefined>;
    expect(billing.street).toBe('123 Main St');
    expect(billing.city).toBeUndefined();
    expect(billing.state).toBe('TS');
    expect(billing.postalCode).toBeUndefined();
    expect(billing.country).toBe('US');
  });

  it('includes currency from form data', () => {
    const data = { ...baseFormData, currency: 'EUR' };
    const payload = buildCustomerPayload(data);
    expect(payload.currency).toBe('EUR');
  });

  it('required name field is passed through', () => {
    const data = { ...baseFormData, name: 'Required Name' };
    const payload = buildCustomerPayload(data);
    expect(payload.name).toBe('Required Name');
  });

  it('payload matches CreateCustomerDto structure (nested addresses)', () => {
    const payload = buildCustomerPayload(baseFormData);

    // These are the fields CreateCustomerDto expects
    expect(payload).toHaveProperty('name');
    expect(payload).toHaveProperty('displayName');
    expect(payload).toHaveProperty('email');
    expect(payload).toHaveProperty('phone');
    expect(payload).toHaveProperty('currency');
    expect(payload).toHaveProperty('taxId');
    expect(payload).toHaveProperty('paymentTerms');
    expect(payload).toHaveProperty('notes');
    expect(payload).toHaveProperty('billingAddress');
    expect(payload).toHaveProperty('shippingAddress');

    // billingAddress should match AddressDto structure
    const billing = payload.billingAddress as Record<string, string>;
    expect(billing).toHaveProperty('street');
    expect(billing).toHaveProperty('city');
    expect(billing).toHaveProperty('state');
    expect(billing).toHaveProperty('postalCode');
    expect(billing).toHaveProperty('country');
  });
});
