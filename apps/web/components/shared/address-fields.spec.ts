/** @jest-environment node */
import { addressFromParty, addressSchema, emptyAddress } from './address-fields';

describe('party address helpers (customer and vendor forms)', () => {
  const party = {
    billingStreet: '1 Nile St',
    billingCity: 'Giza',
    billingState: null,
    billingPostalCode: '12511',
    billingCountry: 'EG',
    shippingStreet: null,
    shippingCity: 'Cairo',
    shippingState: null,
    shippingPostalCode: null,
    shippingCountry: 'EG',
  };

  it('maps the flat billing or shipping columns to the nested form address, nulls as empty', () => {
    expect(addressFromParty(party, 'billing')).toEqual({
      street: '1 Nile St',
      city: 'Giza',
      state: '',
      postalCode: '12511',
      country: 'EG',
    });
    expect(addressFromParty(party, 'shipping')).toEqual({
      street: '',
      city: 'Cairo',
      state: '',
      postalCode: '',
      country: 'EG',
    });
  });

  it('starts empty and accepts an empty address', () => {
    expect(addressSchema.safeParse(emptyAddress()).success).toBe(true);
    expect(Object.values(emptyAddress()).every((v) => v === '')).toBe(true);
  });
});
