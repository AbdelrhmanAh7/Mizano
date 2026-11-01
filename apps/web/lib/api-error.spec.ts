import { getApiErrorCode, getLocalizedApiErrorMessage, isNotFoundError } from './api-error';

const t = Object.assign((key: string) => `ar:${key}`, {
  has: (key: string) => key === 'accountInvalidType',
});
const apiError = (data: unknown) => ({ response: { status: 400, data } });

describe('API error codes', () => {
  it('translates a known code and falls back to the server message, then the fallback', () => {
    const coded = apiError({ code: 'accountInvalidType', message: 'Bill line accounts must be…' });
    expect(getApiErrorCode(coded)).toBe('accountInvalidType');
    expect(getLocalizedApiErrorMessage(coded, 'fallback', t)).toBe('ar:accountInvalidType');

    const uncoded = apiError({ message: 'Period is locked' });
    expect(getApiErrorCode(uncoded)).toBeUndefined();
    expect(getLocalizedApiErrorMessage(uncoded, 'fallback', t)).toBe('Period is locked');
    expect(getLocalizedApiErrorMessage(apiError({}), 'fallback', t)).toBe('fallback');
  });
});

describe('isNotFoundError (#83)', () => {
  it('is true only for a 404 answer, not for a failed request', () => {
    expect(isNotFoundError({ response: { status: 404 } })).toBe(true);
    expect(isNotFoundError({ response: { status: 500 } })).toBe(false);
    expect(isNotFoundError(new Error('Network Error'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
