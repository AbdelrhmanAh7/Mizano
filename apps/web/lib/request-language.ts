import { locales, type Locale } from '@/i18n/config';

function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/**
 * The current UI language, sent to our API as `Accept-Language` so its messages and errors come
 * back in that language. Read from the URL prefix (`/ar/...`, `/en/...`), else from
 * `<html lang>` (set by the locale layout); `undefined` outside the browser.
 */
export function currentUiLocale(): Locale | undefined {
  if (typeof window === 'undefined') return undefined;
  const prefix = window.location.pathname.split('/')[1];
  if (isLocale(prefix)) return prefix;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : undefined;
}

/** `{ 'Accept-Language': <ui locale> }`, or nothing outside the browser. */
export function acceptLanguageHeader(): Record<string, string> {
  const locale = currentUiLocale();
  return locale ? { 'Accept-Language': locale } : {};
}
