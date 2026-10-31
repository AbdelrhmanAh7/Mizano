import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { JournalForm } from './journal-form';
import { RecurringProfileForm } from './recurring-profile-form';

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
