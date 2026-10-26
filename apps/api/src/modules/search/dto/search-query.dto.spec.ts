import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GlobalSearchQueryDto } from './search-query.dto';

const run = async (query: Record<string, unknown>) => {
  const dto = plainToInstance(GlobalSearchQueryDto, query, { enableImplicitConversion: true });
  return { dto, errors: await validate(dto, { whitelist: true, forbidNonWhitelisted: true }) };
};

describe('GlobalSearchQueryDto types', () => {
  it('accepts a single type sent as a plain query string', async () => {
    const { dto, errors } = await run({ q: 'acme', types: 'customer' });
    expect(errors).toEqual([]);
    expect(dto.types).toEqual(['customer']);
  });

  it('accepts a comma separated list', async () => {
    const { dto, errors } = await run({ q: 'acme', types: 'customer, vendor' });
    expect(errors).toEqual([]);
    expect(dto.types).toEqual(['customer', 'vendor']);
  });

  it('still accepts repeated keys (an array)', async () => {
    const { dto, errors } = await run({ q: 'acme', types: ['customer', 'bill'] });
    expect(errors).toEqual([]);
    expect(dto.types).toEqual(['customer', 'bill']);
  });

  it('still rejects an unknown entity type and a too-short query', async () => {
    expect((await run({ q: 'acme', types: 'spaceship' })).errors).not.toEqual([]);
    expect((await run({ q: 'a' })).errors).not.toEqual([]);
  });

  it('leaves types undefined when omitted', async () => {
    const { dto, errors } = await run({ q: 'acme' });
    expect(errors).toEqual([]);
    expect(dto.types).toBeUndefined();
  });
});
