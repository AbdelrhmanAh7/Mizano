/**
 * Reset-password screen: the token comes from the URL fragment (never sent to a server), is
 * removed from the address bar, and a used or expired link leads to requesting a new one.
 */
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

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const mockReset = jest.fn();
jest.mock('@/lib/api', () => ({
  authApi: { resetPassword: (...a: unknown[]) => mockReset(...a) },
}));

import ResetPasswordPage from './page';

function submit(password: string, confirm = password) {
  fireEvent.change(document.getElementById('password')!, { target: { value: password } });
  fireEvent.change(document.getElementById('confirmPassword')!, { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'submit' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/ar/reset-password#token=abc123');
  });

  it('reads the token from the fragment, clears it from the address bar and resets', async () => {
    mockReset.mockResolvedValue({});
    render(<ResetPasswordPage />);
    await screen.findByRole('button', { name: 'submit' });
    expect(window.location.hash).toBe('');

    submit('NewPassword1');
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('abc123', 'NewPassword1'));
    expect(await screen.findByText('doneTitle')).toBeInTheDocument();
  });

  it('enforces the password policy and the confirmation before calling the server', async () => {
    render(<ResetPasswordPage />);
    await screen.findByRole('button', { name: 'submit' });
    submit('password1');
    expect(await screen.findByText('passwordUppercase')).toBeInTheDocument();
    submit('Password1', 'Password2');
    expect(await screen.findByText('passwordMismatch')).toBeInTheDocument();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('offers a new link when the server says the link is used or expired', async () => {
    mockReset.mockRejectedValue({
      response: { status: 400, data: { code: 'PASSWORD_RESET_INVALID', message: 'x' } },
    });
    render(<ResetPasswordPage />);
    await screen.findByRole('button', { name: 'submit' });
    submit('NewPassword1');
    expect(await screen.findByText('invalidTitle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'requestNew' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('treats a missing token as an unusable link', async () => {
    window.history.replaceState(null, '', '/ar/reset-password');
    render(<ResetPasswordPage />);
    expect(await screen.findByText('invalidTitle')).toBeInTheDocument();
  });
});
