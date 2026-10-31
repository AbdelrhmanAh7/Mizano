import { acceptLanguageHeader, currentUiLocale } from './request-language';

describe('request language', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
    document.documentElement.lang = '';
  });

  it('reads the locale from the URL prefix', () => {
    window.history.pushState({}, '', '/ar/sales/invoices');
    document.documentElement.lang = 'en';
    expect(currentUiLocale()).toBe('ar');
    expect(acceptLanguageHeader()).toEqual({ 'Accept-Language': 'ar' });
  });

  it('falls back to <html lang> when the path has no locale', () => {
    window.history.pushState({}, '', '/login');
    document.documentElement.lang = 'en';
    expect(currentUiLocale()).toBe('en');
  });

  it('sends nothing when neither names a supported language', () => {
    window.history.pushState({}, '', '/fr/page');
    document.documentElement.lang = 'fr';
    expect(currentUiLocale()).toBeUndefined();
    expect(acceptLanguageHeader()).toEqual({});
  });
});
