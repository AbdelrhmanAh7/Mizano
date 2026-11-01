import React from 'react';
import { render, screen, within } from '@testing-library/react';
import OnboardingPage from './page';
import arOnboarding from '@/messages/ar/onboarding.json';

jest.mock('next-intl', () => ({
  useLocale: () => 'ar',
  useTranslations: () => (key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        jest.requireActual('@/messages/ar/onboarding.json'),
      ) ?? key,
}));
jest.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('@/components/layout/language-switcher', () => ({ LanguageSwitcher: () => null }));
jest.mock('@/components/brand/brand-logo', () => ({ BrandLogo: () => null }));
jest.mock('@/components/legal/legal-links', () => ({ LegalLinks: () => null }));

describe('OnboardingPage (#676)', () => {
  it('gives the second call-to-action button a see-through background under its white label', () => {
    render(<OnboardingPage />);
    const cta = screen.getByText(arOnboarding.cta.title).closest('section') as HTMLElement;
    const signIn = within(cta).getByRole('link', { name: arOnboarding.cta.login });

    expect(signIn).toHaveClass('bg-transparent', 'text-white');
    expect(signIn).not.toHaveClass('bg-background');
  });

  it('keeps the sticky header solid so nothing shows through it', () => {
    const { container } = render(<OnboardingPage />);
    const header = container.querySelector('header') as HTMLElement;

    expect(header).toHaveClass('sticky', 'bg-background');
    expect(header.className).not.toMatch(/bg-background\/\d+|backdrop-blur/);
  });
});
