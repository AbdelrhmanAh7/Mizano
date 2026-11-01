import { ValidationPipe } from '@nestjs/common';
import { SetLockDateDto } from './organization-settings.dto';

// The same options as the global pipe in main.ts, run on the real route's body type.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
});
const run = (body: unknown): Promise<SetLockDateDto> =>
  pipe.transform(body, { type: 'body', metatype: SetLockDateDto }) as Promise<SetLockDateDto>;

describe('PATCH /organization/lock-date body (#626, #636)', () => {
  it('accepts the day the browser sends and turns it into a date', async () => {
    const dto = await run({ lockDate: '2026-10-31' });
    expect(dto.lockDate).toBeInstanceOf(Date);
    expect(dto.lockDate?.toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('accepts null, which removes the lock', async () => {
    expect((await run({ lockDate: null })).lockDate).toBeNull();
  });

  it.each([
    {},
    { lockDate: 'not a day' },
    { lockDate: '' },
    { lockDate: '2026-02-31' },
    { lockDate: '2026-13-01' },
    { lockDate: '2026-00-01' },
    { lockDate: '2026-10-00' },
    { lockDate: '2026-10-32' },
    { lockDate: '2026-10-31T21:00:00Z' },
    { lockDate: '1' },
    { lockDate: 0 },
    { lockDate: true },
    { lockDate: '2026-10-31', extra: 1 },
  ])('refuses %p', async (body) => {
    await expect(run(body)).rejects.toMatchObject({ status: 400 });
  });
});
