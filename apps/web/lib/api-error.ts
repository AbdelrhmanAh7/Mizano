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

/** HTTP status of an API (axios) error, if any. */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const status = (error as { response?: { status?: unknown } }).response?.status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/** True when the API says the organization is missing a default ledger account. */
export function isMissingDefaultAccountError(error: unknown): boolean {
  return /configure (a )?default .*account/i.test(getApiErrorMessage(error, ''));
}

/** Converts any thrown value into an Error carrying the server message (for ErrorState). */
export function toDisplayError(error: unknown, fallback: string): Error {
  return new Error(getApiErrorMessage(error, fallback));
}
