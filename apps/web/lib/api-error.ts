/**
 * Extracts the server's human-readable message from an API (axios) error so toasts and error
 * states show what the API said ("Please configure default Accounts Payable account ...",
 * "Period is locked ...") instead of "Request failed with status code 400".
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;
    if (data && typeof data === 'object') {
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message)) {
        const parts = message.filter((m): m is string => typeof m === 'string' && !!m.trim());
        if (parts.length > 0) return parts.join('; ');
      }
    }
    if (!response) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return fallback;
}

/** The API's machine-readable error `code` (for example `accountInvalidType`), if it sent one. */
export function getApiErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object') {
      const code = (data as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim()) return code;
    }
  }
  return undefined;
}

/**
 * A translated message for an API error whose `code` has a key in `t` (a next-intl translator),
 * else the server message, else `fallback`. The server message is already in the UI language
 * (`lib/api.ts` sends `Accept-Language`); a key in `t` lets a screen word an error its own way.
 */
export function getLocalizedApiErrorMessage(
  error: unknown,
  fallback: string,
  t: { (key: string): string; has(key: string): boolean },
): string {
  const code = getApiErrorCode(error);
  if (code && t.has(code)) return t(code);
  return getApiErrorMessage(error, fallback);
}
