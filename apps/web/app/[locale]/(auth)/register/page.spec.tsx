/**
 * Register page regressions found in manual QA:
 * - the form accepted "password1" although the API requires upper case, lower case and a digit,
 *   so the user got an untranslated "Validation Failed" toast;
 * - a submit before hydration posted the form natively with GET, putting the password in the URL.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/components/layout/language-switcher', () => ({ LanguageSwitcher: () => null }));

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const mockRegister = jest.fn();
jest.mock('@/lib/api', () => ({ authApi: { register: (...a: unknown[]) => mockRegister(...a) } }));

import RegisterPage from './page';

function fill(password: string) {
  fireEvent.change(document.getElementById('firstName')!, { target: { value: 'Omar' } });
  fireEvent.change(document.getElementById('lastName')!, { target: { value: 'Hassan' } });
  fireEvent.change(document.getElementById('organizationName')!, { target: { value: 'Nile' } });
  fireEvent.change(document.getElementById('email')!, { target: { value: 'o@nile.test' } });
  fireEvent.change(document.getElementById('password')!, { target: { value: password } });
  fireEvent.change(document.getElementById('confirmPassword')!, { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'signUp' }));
}

describe('RegisterPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('posts natively (never GET) so credentials cannot reach the URL', () => {
    const { container } = render(<RegisterPage />);
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
  });

  it('rejects a password without an upper-case letter before calling the API', async () => {
    render(<RegisterPage />);
    fill('password1');
    expect(await screen.findByText('passwordUppercase')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects a password without a digit before calling the API', async () => {
    render(<RegisterPage />);
    fill('Password');
    expect(await screen.findByText('passwordNumber')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('submits a password that meets the API policy', async () => {
    mockRegister.mockResolvedValue({});
    render(<RegisterPage />);
    fill('Password1');
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'accountCreated' }));
  });

  it('shows the translated duplicate-email message for a 409', async () => {
    mockRegister.mockRejectedValue({
      response: { status: 409, data: { message: 'Email already registered' } },
    });
    render(<RegisterPage />);
    fill('Password1');
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'emailExists' }),
      ),
    );
  });
});
