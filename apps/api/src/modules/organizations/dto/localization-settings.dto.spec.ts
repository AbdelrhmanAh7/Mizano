import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LocalizationSettingsDto } from './organization-settings.dto';

// Same options as the global pipe in main.ts
const invalid = async (body: Record<string, unknown>): Promise<string[]> =>
  (
    await validate(plainToInstance(LocalizationSettingsDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);

describe('LocalizationSettingsDto documentDigits (item 3)', () => {
  it.each(['latn', 'arab'])('accepts %s', async (documentDigits) => {
    expect(await invalid({ documentDigits })).toEqual([]);
  });

  it('may be left out or sent as null', async () => {
    expect(await invalid({})).toEqual([]);
    expect(await invalid({ documentDigits: null })).toEqual([]);
  });

  it.each(['', 'arabic', 'ARAB', 'hindi', 'Western (0123)', 1])(
    'refuses %p',
    async (documentDigits) => {
      expect(await invalid({ documentDigits })).toEqual(['documentDigits']);
    },
  );
});
