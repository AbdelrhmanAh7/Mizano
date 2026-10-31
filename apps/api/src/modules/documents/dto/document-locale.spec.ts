import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendDocumentDto, resolveDocumentLocale } from './documents.dto';

describe('resolveDocumentLocale', () => {
  it('uses an explicit locale first', () => {
    expect(resolveDocumentLocale('en', 'ar')).toBe('en');
    expect(resolveDocumentLocale('ar', 'en-US,en;q=0.9')).toBe('ar');
  });

  it('falls back to the best en/ar match of Accept-Language', () => {
    expect(resolveDocumentLocale(undefined, 'en')).toBe('en');
    expect(resolveDocumentLocale(undefined, 'en-GB,en;q=0.9')).toBe('en');
    expect(resolveDocumentLocale(undefined, 'ar-EG')).toBe('ar');
    expect(resolveDocumentLocale(undefined, 'fr-FR,en;q=0.5,ar;q=0.8')).toBe('ar');
    expect(resolveDocumentLocale(undefined, 'ar;q=0.3, EN;q=0.7')).toBe('en');
  });

  it('defaults to Arabic without a usable header', () => {
    expect(resolveDocumentLocale(undefined, undefined)).toBe('ar');
    expect(resolveDocumentLocale(undefined, '')).toBe('ar');
    expect(resolveDocumentLocale(undefined, 'fr,de;q=0.5')).toBe('ar');
    expect(resolveDocumentLocale(undefined, 'en;q=0')).toBe('ar');
    expect(resolveDocumentLocale(undefined, 'en;q=abc')).toBe('ar');
  });
});

describe('SendDocumentDto locale', () => {
  const errors = async (body: Record<string, unknown>): Promise<string[]> =>
    (
      await validate(plainToInstance(SendDocumentDto, { to: 'a@example.com', ...body }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).map((e) => e.property);

  it('accepts en and ar for the attached PDF and refuses anything else', async () => {
    expect(await errors({ locale: 'ar' })).toEqual([]);
    expect(await errors({ locale: 'en' })).toEqual([]);
    expect(await errors({})).toEqual([]);
    expect(await errors({ locale: 'fr' })).toEqual(['locale']);
  });
});
