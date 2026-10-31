import type { Response } from 'express';
import { parseAcceptLanguage, requestLocale, requestLocaleMiddleware } from './request-locale';

describe('parseAcceptLanguage', () => {
  it.each([
    [undefined, 'ar'],
    ['', 'ar'],
    ['*', 'ar'],
    ['fr-FR,de;q=0.8', 'ar'],
    ['garbage;;;', 'ar'],
    ['en', 'en'],
    ['ar', 'ar'],
    ['EN-us', 'en'],
    ['ar-SA,ar;q=0.9', 'ar'],
    ['en-US,en;q=0.9,ar;q=0.8', 'en'],
    ['en;q=0.5,ar;q=0.9', 'ar'],
    ['fr,en;q=0.7', 'en'],
    ['en;q=0,ar;q=0.1', 'ar'],
    ['en;q=0', 'ar'],
    ['en;q=abc,ar;q=0.2', 'ar'],
    ['en, ar', 'en'],
    ['ar, en', 'ar'],
  ])('%j -> %s', (header, expected) => {
    expect(parseAcceptLanguage(header)).toBe(expected);
  });

  it('reads a repeated header', () => {
    expect(parseAcceptLanguage(['fr', 'en;q=0.5'])).toBe('en');
  });
});

describe('requestLocale', () => {
  it('stores the language on the request once, through the middleware', () => {
    const request: { headers: Record<string, string>; locale?: 'ar' | 'en' } = {
      headers: { 'accept-language': 'en-GB' },
    };
    const next = jest.fn();
    requestLocaleMiddleware(request as never, {} as Response, next);
    expect(request.locale).toBe('en');
    expect(next).toHaveBeenCalledTimes(1);
    expect(requestLocale(request as never)).toBe('en');
  });

  it('parses the header when the middleware has not run', () => {
    expect(requestLocale({ headers: { 'accept-language': 'en' } } as never)).toBe('en');
    expect(requestLocale({ headers: {} } as never)).toBe('ar');
  });
});
