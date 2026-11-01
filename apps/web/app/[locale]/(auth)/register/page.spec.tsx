/**
 * Register page regressions found in manual QA:
 * - the form accepted "password1" although the API requires upper case, lower case and a digit,
 *   so the user got an untranslated "Validation Failed" toast;
 * - a submit before hydration posted the form natively with GET, putting the password in the URL.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      // Renders every tag callback, so the agreement's links reach the DOM.
      rich: (key: string, tags: Record<string, (chunks: string) => React.ReactNode>) =>
        jest.requireActual<typeof import('react')>('react').createElement(
          'span',
          null,
          key,
          ...Object.entries(tags).map(([tag, render]) => render(tag)),
        ),
    }),
  useLocale: () => 'en',
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

const mockSignIn = jest.fn();
jest.mock('next-auth/react', () => ({ signIn: (...a: unknown[]) => mockSignIn(...a) }));

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
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({ ok: true, error: undefined });
  });

  it('links the terms of use and the privacy policy next to the sign-up button', () => {
    render(<RegisterPage />);
    expect(screen.getByText('terms').closest('a')).toHaveAttribute('href', '/terms');
    expect(screen.getByText('privacy').closest('a')).toHaveAttribute('href', '/privacy');
  });

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
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'accountCreated' })),
    );
  });

  it('starts the organization in Egypt unless another country is chosen', async () => {
    mockRegister.mockResolvedValue({});
    render(<RegisterPage />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Egypt (Egyptian Pound)');
    fill('Password1');
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ country: 'EG' })),
    );
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

  describe('after the account is created (TestSprite theme 1)', () => {
    const strong = 'Password123';

    it('signs in with the new account and lands on the dashboard (first-use tour)', async () => {
      mockRegister.mockResolvedValue({ data: {} });
      mockSignIn.mockResolvedValue({ ok: true, error: undefined });
      render(<RegisterPage />);
      fill(strong);
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/dashboard'));
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'o@nile.test',
        password: strong,
        redirect: false,
      });
    });

    it('sends the person to Sign In when that sign-in is refused or fails', async () => {
      mockRegister.mockResolvedValue({ data: {} });
      const outcomes = [
        () => Promise.resolve({ ok: false, error: 'CredentialsSignin' }),
        () => Promise.reject(new Error('network')),
      ];
      for (const outcome of outcomes) {
        mockPush.mockClear();
        mockToast.mockClear();
        mockSignIn.mockImplementationOnce(outcome);
        const { unmount } = render(<RegisterPage />);
        fill(strong);
        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/login'));
        // The account exists, so no error toast is shown.
        expect(mockToast).not.toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' }),
        );
        unmount();
      }
    });
  });
});
