import { getScanReviewErrorMessage } from './scan-review-error';
import en from '@/messages/en/ai.json';
import ar from '@/messages/ar/ai.json';

const apiError = (message: unknown) => ({ response: { data: { message } } });

describe('scan review errors', () => {
  it.each([en, ar])('localizes document currency rejection in each locale', (messages) => {
    const localized = messages.intake.scan.currencyMismatch;
    expect(localized).toBeTruthy();
    expect(localized).not.toContain('?');
    expect(
      getScanReviewErrorMessage(
        apiError(
          'Document currency USD differs from the base currency EGP; foreign-currency documents are not supported yet',
        ),
        'fallback',
        localized,
      ),
    ).toBe(localized);
  });

  it('preserves other API errors', () => {
    expect(getScanReviewErrorMessage(apiError('Period is locked'), 'fallback', 'localized')).toBe(
      'Period is locked',
    );
  });

  it('preserves the fallback for unknown errors', () => {
    expect(getScanReviewErrorMessage({}, 'fallback', 'localized')).toBe('fallback');
  });
});
