/** Forgot-password screen: sends the UI language and shows the same answer for any address. */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ar',
}));

jest.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/components/layout/language-switcher', () => ({ LanguageSwitcher: () => null }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const mockForgot = jest.fn();
jest.mock('@/lib/api', () => ({
  authApi: { forgotPassword: (...a: unknown[]) => mockForgot(...a) },
}));

import ForgotPasswordPage from './page';

describe('ForgotPasswordPage', () => {
  it('posts natively and sends the email with the UI language', async () => {
    mockForgot.mockResolvedValue({});
    const { container } = render(<ForgotPasswordPage />);
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
    // No mail set up: the screen tells the person to ask their organization owner (#599).
    expect(screen.getByText('noMail')).toBeInTheDocument();

    fireEvent.change(document.getElementById('email')!, { target: { value: 'o@nile.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'sendResetLink' }));

    await waitFor(() => expect(mockForgot).toHaveBeenCalledWith('o@nile.test', 'ar'));
    expect(await screen.findByText('sentTitle')).toBeInTheDocument();
  });
});
