import { ValidationPipe } from '@nestjs/common';
import { ExternalEInvoiceReferenceDto } from './external-einvoice-reference.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
});
const transform = (value: unknown) =>
  pipe.transform(value, {
    type: 'body',
    metatype: ExternalEInvoiceReferenceDto,
  });

describe('external ETA reference DTO', () => {
  it('trims references and clears blanks with null', async () => {
    expect(await transform({ externalEInvoiceNumber: ' ETA-001 ' })).toEqual({
      externalEInvoiceNumber: 'ETA-001',
    });
    expect(await transform({ externalEInvoiceNumber: '  ' })).toEqual({
      externalEInvoiceNumber: null,
    });
    expect(await transform({ externalEInvoiceNumber: null })).toEqual({
      externalEInvoiceNumber: null,
    });
  });
  it.each([
    {},
    { externalEInvoiceNumber: 123 },
    { externalEInvoiceNumber: 'x'.repeat(101) },
    { externalEInvoiceNumber: 'ETA', amount: '1' },
    { externalEInvoiceNumber: 'ETA', organizationId: 'foreign' },
  ])('rejects missing, invalid or financial/tenant fields: %j', async (body) => {
    await expect(transform(body)).rejects.toThrow();
  });
});
