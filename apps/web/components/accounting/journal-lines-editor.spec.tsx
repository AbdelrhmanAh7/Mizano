import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { JournalForm } from './journal-form';
import { RecurringProfileForm } from './recurring-profile-form';

// Real English messages (accounting namespace) so the labels below are the shipped copy.
jest.mock('next-intl', () => {
  const messages = { accounting: jest.requireActual('@/messages/en/accounting.json') };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages,
      );
  return {
    useLocale: () => 'en',
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

const amountInputs = () => screen.getAllByPlaceholderText('0.00') as HTMLInputElement[];

describe('JournalLinesEditor (journal and recurring template forms)', () => {
  it.each([
    ['journal', () => <JournalForm accounts={[]} onSubmit={jest.fn()} onCancel={jest.fn()} />],
    [
      'recurring template',
      () => <RecurringProfileForm accounts={[]} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    ],
  ])('keeps two lines, clears the opposite side and shows the balance (%s)', (_, ui) => {
    render(ui());
    // Two lines, each with a debit and a credit input; neither can be removed.
    expect(amountInputs()).toHaveLength(4);
    for (const b of screen.getAllByRole('button', { name: 'Remove journal line' })) {
      expect(b).toBeDisabled();
    }

    const [debit1, credit1, debit2, credit2] = amountInputs();
    fireEvent.change(credit1, { target: { value: '40' } });
    fireEvent.change(debit1, { target: { value: '100' } });
    expect(credit1.value).toBe('0');
    fireEvent.change(credit2, { target: { value: '60' } });
    expect(screen.getByText(/Unbalanced \(Difference: 40\.00\)/)).toBeInTheDocument();
    fireEvent.change(credit2, { target: { value: '100' } });
    expect(debit2.value).toBe('0');
    expect(screen.getByText('Balanced')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Line/ }));
    expect(amountInputs()).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: 'Remove journal line' })[2]).toBeEnabled();
  });
});
