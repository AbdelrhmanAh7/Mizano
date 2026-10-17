import { buildCustomerPayload, type CustomerFormData } from './customer-form';

const values: CustomerFormData = {
  name: 'Nile Traders',
  displayName: '',
  email: 'billing@nile.example',
  phone: '+201000000215',
  currency: 'EGP',
  taxId: '',
  paymentTerms: 30,
  notes: 'Prefers invoices by e-mail',
  billingAddress: {
    street: '1 Nile St',
    city: 'Cairo',
    state: '',
    postalCode: '11511',
    country: 'EG',
  },
  shippingAddress: { street: '', city: '', state: '', postalCode: '', country: '' },
};

describe('buildCustomerPayload (#215)', () => {
  it('sends nested billing and shipping addresses and no flat address keys', () => {
    const payload = buildCustomerPayload(values);

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
      shippingAddress: { street: null, city: null, state: null, postalCode: null, country: null },
    });
    for (const flat of ['billingStreet', 'billingCity', 'shippingStreet', 'shippingCity']) {
      expect(payload).not.toHaveProperty(flat);
    }
  });

  it('sends empty notes as null so an edit can clear them', () => {
    expect(buildCustomerPayload({ ...values, notes: '' }).notes).toBeNull();
  });
});
