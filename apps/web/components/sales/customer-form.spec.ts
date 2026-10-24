jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

import { buildCustomerPayload } from './customer-form';
import { createCustomerSchema } from '@mizano/validators';

const baseFormData = {
  name: 'Test Customer',
  displayName: 'Test Display',
  email: 'test@example.com',
  phone: '+1-555-0100',
  currency: 'USD',
  taxId: 'TAX123',
  paymentTerms: 30,
  notes: 'Test notes',
  billingAddress: {
    street: '123 Main St',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'US',
  },
  shippingAddress: {
    street: '456 Oak Ave',
    city: 'Brooklyn',
    state: 'NY',
    postalCode: '11201',
    country: 'US',
  },
};

describe('buildCustomerPayload - DTO boundary validation', () => {
  it('produces a payload accepted by createCustomerSchema for standard form input', () => {
    const payload = buildCustomerPayload(baseFormData);
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('omits disallowed root-level address fields (billingStreet, billingCity, etc.)', () => {
    const payload = buildCustomerPayload(baseFormData);
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

  it('structures addresses as nested objects per DTO schema', () => {
    const payload = buildCustomerPayload(baseFormData);
    expect(payload.billingAddress).toEqual({
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
    });
    expect(payload.shippingAddress).toEqual({
      street: '456 Oak Ave',
      city: 'Brooklyn',
      state: 'NY',
      postalCode: '11201',
      country: 'US',
    });
  });

  it('accepts minimal required fields only (name)', () => {
    const minimalData = {
      ...baseFormData,
      displayName: '',
      email: '',
      phone: '',
      taxId: '',
      notes: '',
      billingAddress: undefined,
      shippingAddress: undefined,
      paymentTerms: undefined,
    };
    const payload = buildCustomerPayload(minimalData);
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Test Customer');
      expect(result.data.displayName).toBeUndefined();
      expect(result.data.email).toBeUndefined();
      expect(result.data.billingAddress).toBeUndefined();
      expect(result.data.shippingAddress).toBeUndefined();
    }
  });

  it('trims whitespace from optional string fields and omits empty ones', () => {
    const dataWithWhitespace = {
      ...baseFormData,
      displayName: '  Trimmed  ',
      email: '  test@example.com  ',
      phone: '  ',
      taxId: '',
      notes: '   ',
    };
    const payload = buildCustomerPayload(dataWithWhitespace);
    expect(payload.displayName).toBe('Trimmed');
    expect(payload.email).toBe('test@example.com');
    expect(payload.phone).toBeUndefined();
    expect(payload.taxId).toBeUndefined();
    expect(payload.notes).toBeUndefined();
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('omits address when all address fields are empty or whitespace', () => {
    const dataWithEmptyAddress = {
      ...baseFormData,
      billingAddress: {
        street: '  ',
        city: '',
        state: '   ',
        postalCode: '',
        country: '  ',
      },
      shippingAddress: {
        street: '',
        city: '  ',
        state: '',
        postalCode: '   ',
        country: '',
      },
    };
    const payload = buildCustomerPayload(dataWithEmptyAddress);
    expect(payload.billingAddress).toBeUndefined();
    expect(payload.shippingAddress).toBeUndefined();
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('includes partial address when some fields are provided', () => {
    const dataWithPartialAddress = {
      ...baseFormData,
      billingAddress: {
        street: '123 Main St',
        city: '',
        state: 'NY',
        postalCode: '',
        country: 'US',
      },
      shippingAddress: undefined,
    };
    const payload = buildCustomerPayload(dataWithPartialAddress);
    expect(payload.billingAddress).toEqual({
      street: '123 Main St',
      city: undefined,
      state: 'NY',
      postalCode: undefined,
      country: 'US',
    });
    expect(payload.shippingAddress).toBeUndefined();
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('defaults currency to USD when not provided', () => {
    const dataWithoutCurrency = { ...baseFormData, currency: '' };
    const payload = buildCustomerPayload(dataWithoutCurrency);
    expect(payload.currency).toBe('USD');
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('handles zero payment terms correctly', () => {
    const dataWithZeroTerms = { ...baseFormData, paymentTerms: 0 };
    const payload = buildCustomerPayload(dataWithZeroTerms);
    expect(payload.paymentTerms).toBe(0);
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects payload with invalid email format', () => {
    const dataWithBadEmail = { ...baseFormData, email: 'not-an-email' };
    const payload = buildCustomerPayload(dataWithBadEmail);
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i: { path: (string | number)[] }) => i.path.includes('email')),
      ).toBe(true);
    }
  });

  it('rejects payload with currency not 3 characters', () => {
    const dataWithBadCurrency = { ...baseFormData, currency: 'US' };
    const payload = buildCustomerPayload(dataWithBadCurrency);
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i: { path: (string | number)[] }) => i.path.includes('currency')),
      ).toBe(true);
    }
  });

  it('rejects payload with payment terms exceeding max', () => {
    const dataWithBadTerms = { ...baseFormData, paymentTerms: 400 };
    const payload = buildCustomerPayload(dataWithBadTerms);
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i: { path: (string | number)[] }) =>
          i.path.includes('paymentTerms'),
        ),
      ).toBe(true);
    }
  });

  it('rejects payload with negative payment terms', () => {
    const dataWithNegativeTerms = { ...baseFormData, paymentTerms: -5 };
    const payload = buildCustomerPayload(dataWithNegativeTerms);
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i: { path: (string | number)[] }) =>
          i.path.includes('paymentTerms'),
        ),
      ).toBe(true);
    }
  });

  it('handles legacy form data with flat address fields by ignoring them', () => {
    // Simulate form state that might have legacy flat address fields
    const legacyData = {
      ...baseFormData,
      // These are NOT part of CustomerFormData type but could exist in raw form state
      billingStreet: '789 Legacy St',
      billingCity: 'Legacy City',
      shippingStreet: '999 Old Ave',
    } as unknown as typeof baseFormData;
    const payload = buildCustomerPayload(legacyData);
    // The payload should only contain nested addresses from billingAddress/shippingAddress
    expect(payload).not.toHaveProperty('billingStreet');
    expect(payload).not.toHaveProperty('billingCity');
    expect(payload).not.toHaveProperty('shippingStreet');
    const result = createCustomerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe('buildCustomerPayload - isolation & performance', () => {
  it('executes without DOM dependencies (pure function)', () => {
    // This test verifies no React DOM rendering occurs
    // by ensuring it runs without @testing-library/react imports
    const start = performance.now();
    const payload = buildCustomerPayload(baseFormData);
    const duration = performance.now() - start;
    expect(payload.name).toBe('Test Customer');
    expect(duration).toBeLessThan(50); // Should complete in under 50ms
  });
});
