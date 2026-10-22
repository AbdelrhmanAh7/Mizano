import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateCustomerDto } from './create-customer.dto';
import { UpdateCustomerDto } from './update-customer.dto';

// Same options as the global pipe in main.ts: unknown properties are a 400, not silently dropped.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
});

const validate = (dto: typeof CreateCustomerDto | typeof UpdateCustomerDto, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: dto });

// Mirrors buildCustomerPayload() in apps/web/components/sales/customer-form.tsx; keep the two in sync.
const formPayload = {
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
};

describe('Customer DTOs accept the payload the customer form builds (#215)', () => {
  it.each([
    ['CreateCustomerDto', CreateCustomerDto],
    ['UpdateCustomerDto', UpdateCustomerDto],
  ] as const)('%s accepts the form payload with and without notes', async (_name, dto) => {
    await expect(validate(dto, formPayload)).resolves.toMatchObject({
      notes: 'Prefers invoices by e-mail',
      billingAddress: { street: '1 Nile St', city: 'Cairo' },
    });
    await expect(validate(dto, { ...formPayload, notes: null })).resolves.toBeDefined();
    const { notes: _notes, ...withoutNotes } = formPayload;
    await expect(validate(dto, withoutNotes)).resolves.toBeDefined();
  });

  it('rejects the legacy flat address payload the form used to send', async () => {
    const legacy = {
      name: 'Nile Traders',
      notes: 'x',
      billingStreet: '1 Nile St',
      billingCity: 'Cairo',
    };
    await expect(validate(CreateCustomerDto, legacy)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects notes longer than 2000 characters', async () => {
    await expect(
      validate(CreateCustomerDto, { ...formPayload, notes: 'x'.repeat(2001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
