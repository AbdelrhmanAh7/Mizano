/** The admin hands a member a one-time reset link (#599): asked in the UI language, shown once. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useLocale: () => 'ar',
  useTranslations: () => (key: string) => key,
}));

const mutateAsync = jest.fn();
const mutation = { mutateAsync, isPending: false };
jest.mock('@/lib/hooks/use-users', () => ({ useCreateResetLink: () => mutation }));

import { MemberResetLinkButton } from './member-reset-link';

describe('MemberResetLinkButton', () => {
  it('creates the link in the UI language and shows it to copy', async () => {
    mutateAsync.mockResolvedValue({
      link: 'https://app.test/ar/reset-password#token=abc',
      expiresAt: '2026-10-31T12:30:00.000Z',
    });
    render(<MemberResetLinkButton userId="m1" name="Mona" />);

    fireEvent.click(screen.getByRole('button', { name: 'button' }));

    expect(
      await screen.findByDisplayValue('https://app.test/ar/reset-password#token=abc'),
    ).toBeInTheDocument();
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1', locale: 'ar' });
    expect(screen.getByText('description')).toBeInTheDocument();
  });

  it('shows no dialog when the link could not be created', async () => {
    mutateAsync.mockRejectedValue(new Error('refused'));
    render(<MemberResetLinkButton userId="m1" name="Mona" />);
    fireEvent.click(screen.getByRole('button', { name: 'button' }));
    await Promise.resolve();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
