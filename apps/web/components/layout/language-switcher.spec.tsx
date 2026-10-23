import React, { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSwitcher } from './language-switcher';

let mockLocale: 'en' | 'ar' = 'en';
let mockPathname = '/en/purchases/bills/new';

jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  useTranslations: () => (key: string) =>
    key === 'language' ? (mockLocale === 'en' ? 'Language' : 'اللغة') : key,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockPathname = '/en/purchases/bills/new';
  });

  it('renders Language button with accessible label and opens dropdown with Arabic link in en locale', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button', { name: /Language/i });
    expect(button).toBeInTheDocument();

    await act(async () => {
      await user.click(button);
    });

    // Arabic link exists with accessible label 'Arabic (العربية)', href pointing to /ar route, and visible text
    const arabicLink = screen.getByRole('link', { name: /Arabic/i });
    expect(arabicLink).toBeInTheDocument();
    expect(arabicLink).toHaveAttribute('href', '/ar/purchases/bills/new');
    expect(arabicLink).toHaveAttribute('hrefLang', 'ar');
    expect(screen.getByText('العربية')).toBeInTheDocument();
    expect(screen.getByText('Arabic')).toBeInTheDocument();

    // English link exists pointing to /en route
    const englishLink = screen.getByRole('link', { name: /English/i });
    expect(englishLink).toHaveAttribute('href', '/en/purchases/bills/new');
  });

  it('renders localized button and target urls when in ar locale', async () => {
    mockLocale = 'ar';
    mockPathname = '/ar/purchases/bills/new';
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button', { name: /Language/i });
    expect(button).toBeInTheDocument();

    await act(async () => {
      await user.click(button);
    });

    const englishLink = screen.getByRole('link', { name: /English/i });
    expect(englishLink).toHaveAttribute('href', '/en/purchases/bills/new');
    expect(englishLink).toHaveAttribute('hrefLang', 'en');

    const arabicLink = screen.getByRole('link', { name: /Arabic/i });
    expect(arabicLink).toHaveAttribute('href', '/ar/purchases/bills/new');
  });
});
