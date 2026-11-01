/** Countries a new organization can start in, with the currency and clock that follow. */
export const SIGN_UP_COUNTRIES = ['EG', 'SA', 'AE'] as const;
export type SignUpCountry = (typeof SIGN_UP_COUNTRIES)[number];

export interface OrganizationRegion {
  country: SignUpCountry | null;
  baseCurrency: string;
  timezone?: string;
}

const REGIONS: Record<SignUpCountry, { baseCurrency: string; timezone: string }> = {
  EG: { baseCurrency: 'EGP', timezone: 'Africa/Cairo' },
  SA: { baseCurrency: 'SAR', timezone: 'Asia/Riyadh' },
  AE: { baseCurrency: 'AED', timezone: 'Asia/Dubai' },
};

/** Currency and time zone for a new organization; without a country it starts in USD. */
export function organizationRegion(country?: SignUpCountry): OrganizationRegion {
  if (!country) return { country: null, baseCurrency: 'USD' };
  return { country, ...REGIONS[country] };
}
