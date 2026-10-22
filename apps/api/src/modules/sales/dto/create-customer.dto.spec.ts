import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
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

// Exactly what buildCustomerPayload() in apps/web/components/sales/customer-form.tsx returns:
// customer-form.spec.tsx asserts the builder's output equals this shared fixture (packages/shared-types/fixtures),
// so the two sides cannot drift and the API spec does not depend on apps/web being present.
const formPayload = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../../../../packages/shared-types/fixtures/customer-form-payload.fixture.json',
    ),
    'utf8',
  ),
) as Record<string, unknown>;

describe('Customer DTOs accept the payload the customer form builds (#215)', () => {
  it.each([
    ['CreateCustomerDto', CreateCustomerDto],
    ['UpdateCustomerDto', UpdateCustomerDto],
  ] as const)('%s accepts the form payload with and without notes', async (_name, dto) => {
    await expect(validate(dto, formPayload)).resolves.toMatchObject({
      notes: 'Prefers invoices by e-mail',
      billingAddress: { street: '1 Nile St', city: 'Cairo' },
      shippingAddress: { street: '9 Port Rd', city: 'Alexandria' },
    });
    await expect(validate(dto, { ...formPayload, notes: null })).resolves.toBeDefined();
    const { notes: _notes, ...withoutNotes } = formPayload;
    await expect(validate(dto, withoutNotes)).resolves.toBeDefined();
  });

  it('UpdateCustomerDto inherits notes: an edit that only changes or clears notes is accepted', async () => {
    await expect(validate(UpdateCustomerDto, { notes: 'Call before delivery' })).resolves.toEqual({
      notes: 'Call before delivery',
    });
    await expect(validate(UpdateCustomerDto, { notes: null })).resolves.toEqual({ notes: null });
  });

  it.each([
    ['CreateCustomerDto', CreateCustomerDto],
    ['UpdateCustomerDto', UpdateCustomerDto],
  ] as const)(
    '%s rejects the legacy flat address payload the form used to send',
    async (_name, dto) => {
      const legacy = {
        name: 'Nile Traders',
        notes: 'x',
        billingStreet: '1 Nile St',
        billingCity: 'Cairo',
      };
      await expect(validate(dto, legacy)).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects notes longer than 2000 characters', async () => {
    await expect(
      validate(CreateCustomerDto, { ...formPayload, notes: 'x'.repeat(2001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
