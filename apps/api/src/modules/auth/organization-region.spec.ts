import { organizationRegion } from './organization-region';

describe('organizationRegion', () => {
  it.each([
    ['EG', 'EGP', 'Africa/Cairo'],
    ['SA', 'SAR', 'Asia/Riyadh'],
    ['AE', 'AED', 'Asia/Dubai'],
  ] as const)('starts an organization in %s with %s and %s', (country, currency, timezone) => {
    expect(organizationRegion(country)).toEqual({ country, baseCurrency: currency, timezone });
  });

  it('keeps the old USD start when no country is given', () => {
    expect(organizationRegion()).toEqual({ country: null, baseCurrency: 'USD' });
  });
});
