import type { NextFunction, Request, Response } from 'express';

/** The two languages the server answers in (owner rule: Arabic and English everywhere). */
export type Locale = 'ar' | 'en';

/** A request without a usable `Accept-Language` is answered in Arabic. */
export const DEFAULT_LOCALE: Locale = 'ar';

const SUPPORTED: readonly Locale[] = ['ar', 'en'];

function isLocale(value: string): value is Locale {
  return (SUPPORTED as readonly string[]).includes(value);
}

/**
 * Picks the supported language with the highest q-value from an `Accept-Language` header
 * (`en-US,en;q=0.9,ar;q=0.8` -> `en`). Region subtags are ignored, `q=0` means "not this one",
 * ties keep header order, and a missing, malformed or unsupported header gives Arabic.
 */
export function parseAcceptLanguage(header: string | string[] | undefined): Locale {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return DEFAULT_LOCALE;

  const ranked: Array<{ locale: Locale; q: number; index: number }> = [];
  raw.split(',').forEach((part, index) => {
    const [tag, ...params] = part.trim().split(';');
    const primary = tag.trim().toLowerCase().split('-')[0];
    if (!isLocale(primary)) return;
    let q = 1;
    for (const param of params) {
      const [key, value] = param.trim().split('=');
      if (key?.trim().toLowerCase() === 'q') {
        const parsed = Number(value);
        q = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    if (q > 0) ranked.push({ locale: primary, q, index });
  });

  ranked.sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked[0]?.locale ?? DEFAULT_LOCALE;
}

/** A request that may carry the locale resolved by {@link requestLocaleMiddleware}. */
type LocalizedRequest = Pick<Request, 'headers'> & { locale?: Locale };

/**
 * The language of this request. Reads the value set by the middleware, and parses the header
 * itself for errors raised before the middleware ran (body parsing, unknown routes).
 */
export function requestLocale(request: LocalizedRequest): Locale {
  return request.locale ?? parseAcceptLanguage(request.headers?.['accept-language']);
}

/** Stores the request language on `req.locale` once per request (registered in AppModule). */
export function requestLocaleMiddleware(
  request: LocalizedRequest,
  _response: Response,
  next: NextFunction,
): void {
  request.locale = parseAcceptLanguage(request.headers['accept-language']);
  next();
}
