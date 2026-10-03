import { getApiErrorMessage } from './api-error';

/** Localize the intake currency validation while preserving other API errors. */
export function getScanReviewErrorMessage(
  error: unknown,
  fallback: string,
  currencyMismatch: string,
): string {
  const message = getApiErrorMessage(error, fallback);
  return /^Document currency \S+ differs from the base currency \S+; foreign-currency documents are not supported yet$/.test(
    message,
  )
    ? currencyMismatch
    : message;
}
