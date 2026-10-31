/**
 * Manual QA: a newly registered organization could not save Settings > Organization (and so
 * could not set its base currency): the form sent '' for the empty email and an industry label
 * the API does not accept, and the API refused the whole update.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockMutate = jest.fn();
jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});
// Stable like React Query's data: a new object per render would re-run the page's reset effect.
const mockSettings = {
  isLoading: false,
  data: {
    general: {
      name: 'Riyadh Trading',
      email: null,
      phone: null,
      address: null,
      website: null,
      taxRegistrationNumber: null,
      industry: 'other',
      baseCurrency: 'USD',
    },
  },
};
jest.mock('@/lib/hooks/use-all-settings', () => ({
  useAllOrganizationSettings: () => mockSettings,
  useUpdateGeneralSettings: () => ({ mutate: mockMutate, isPending: false }),
}));

import OrganizationSettingsPage from './page';

describe('OrganizationSettingsPage', () => {
  it('sends empty optional fields as null and a valid industry when saving', async () => {
    render(<OrganizationSettingsPage />);
    fireEvent.change(screen.getByLabelText('organization.taxRegistrationNumber'), {
      target: { value: '300000000000003' },
    });
    fireEvent.click(screen.getByRole('button', { name: /common.saveChanges/ }));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    expect(mockMutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: 'Riyadh Trading',
        email: null,
        website: null,
        taxRegistrationNumber: '300000000000003',
        industry: 'other',
        baseCurrency: 'USD',
      }),
    );
  });

  it('offers the API industry values', () => {
    render(<OrganizationSettingsPage />);
    const values = Array.from(document.querySelectorAll('select option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(expect.arrayContaining(['retail', 'services', 'other', 'SAR', 'EGP']));
    expect(values).not.toContain('Technology');
  });
});
