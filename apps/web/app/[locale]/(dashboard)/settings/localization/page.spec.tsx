/**
 * Item 3: the organization chooses the digits of Arabic PDFs. The form sends the API enum value
 * (`latn` / `arab`), never a label or an empty string.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LocalizationSettingsPage from './page';

jest.mock('next-intl', () => {
  const messages = {
    settings: jest.requireActual('@/messages/ar/settings.json'),
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages,
      );
  return {
    useLocale: () => 'ar',
    useTranslations: (namespace: string) => (key: string) =>
      String(lookup(`${namespace}.${key}`) ?? key),
  };
});

const mutate = jest.fn();
// Stable objects: a new object per render would re-run the form.reset effect forever.
const settingsQuery = {
  isLoading: false,
  data: {
    localization: {
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,000.00',
      timezone: 'Africa/Cairo',
      documentDigits: 'latn',
    },
  },
};
const updateMutation = { mutate, isPending: false };

jest.mock('@/lib/hooks/use-all-settings', () => ({
  ...jest.requireActual('@/lib/hooks/use-all-settings'),
  useAllOrganizationSettings: () => settingsQuery,
  useUpdateLocalizationSettings: () => updateMutation,
}));

const digitsSelect = (): HTMLSelectElement => {
  const select = Array.from(document.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'arab'),
  );
  if (!select) throw new Error('digits select not rendered');
  return select;
};

describe('LocalizationSettingsPage document digits', () => {
  beforeEach(() => mutate.mockReset());

  it('labels the setting in Arabic and starts from the stored value', () => {
    render(<LocalizationSettingsPage />);
    expect(screen.getByText('الأرقام في ملفات PDF العربية')).toBeInTheDocument();
    expect(digitsSelect().value).toBe('latn');
  });

  it('saves the enum value the API accepts', async () => {
    render(<LocalizationSettingsPage />);
    fireEvent.change(digitsSelect(), { target: { value: 'arab' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ/ }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][0]).toEqual({
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,000.00',
      timezone: 'Africa/Cairo',
      documentDigits: 'arab',
    });
  });
});
