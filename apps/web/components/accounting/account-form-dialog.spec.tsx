import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountFormDialog } from './account-form-dialog';

let mockLocale: 'en' | 'ar' = 'ar';

// Real catalogs, so the assertions below are the shipped copy in each language.
jest.mock('next-intl', () => {
  const messages = {
    en: {
      accounting: jest.requireActual('@/messages/en/accounting.json'),
      common: jest.requireActual('@/messages/en/common.json'),
    },
    ar: {
      accounting: jest.requireActual('@/messages/ar/accounting.json'),
      common: jest.requireActual('@/messages/ar/common.json'),
    },
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages[mockLocale],
      );
  return {
    useLocale: () => mockLocale,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, string | number>) =>
        String(lookup(`${namespace}.${key}`) ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values?.[name] ?? ''),
        );
      t.has = (key: string) => typeof lookup(`${namespace}.${key}`) === 'string';
      return t;
    },
  };
});

jest.mock('@/lib/hooks/use-organization', () => ({
  useBaseCurrency: () => 'EGP',
  useMoneyFormat: () => ({ data: { baseCurrency: 'EGP', documentDigits: 'latn' } }),
}));

const renderDialog = (onSubmit = jest.fn()) =>
  render(<AccountFormDialog open onOpenChange={jest.fn()} accounts={[]} onSubmit={onSubmit} />);

describe('AccountFormDialog', () => {
  it('renders in Arabic without English labels and translates validation', async () => {
    mockLocale = 'ar';
    const onSubmit = jest.fn();
    renderDialog(onSubmit);

    expect(screen.getByRole('heading', { name: 'إنشاء حساب' })).toBeInTheDocument();
    expect(screen.getByText('رمز الحساب *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    const english = Array.from(dialog.querySelectorAll('label, button, h2, p, span'))
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent?.trim() ?? '')
      // Currency codes are ISO codes in both languages.
      .filter((text) => /[A-Za-z]{3,}/.test(text) && !/^[A-Z]{3}\b/.test(text));
    expect(english).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));
    expect(await screen.findByText('رمز الحساب مطلوب')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('starts a new account in the organization base currency', async () => {
    mockLocale = 'en';
    const onSubmit = jest.fn();
    renderDialog(onSubmit);

    fireEvent.change(screen.getByLabelText('Account Code *'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Account Name *'), { target: { value: 'Cash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      currency: 'EGP',
    });
  });
});
