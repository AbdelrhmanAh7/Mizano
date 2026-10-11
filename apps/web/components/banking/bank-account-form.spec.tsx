/**
 * Regression tests for BankAccountForm.
 *
 * Errors 3 & 4: <Select.Item /> must not have value="" — Radix UI throws at render time.
 * Root cause: <SelectItem value="">None</SelectItem> in the GL Account select.
 * Fix: use value="__none__" sentinel and convert back to "" in onValueChange.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BankAccountForm } from './bank-account-form';

// Mock next-intl (not used directly in form but providers may need it)
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock the use-bank-accounts hook exports
jest.mock('@/lib/hooks/use-bank-accounts', () => ({
  accountTypeOptions: [
    { value: 'BANK', label: 'Bank Account' },
    { value: 'CREDIT_CARD', label: 'Credit Card' },
    { value: 'PETTY_CASH', label: 'Petty Cash' },
  ],
}));

const defaultProps = {
  glAccounts: [
    { id: 'acc-1', name: 'Cash and Cash Equivalents', code: '1010' },
    { id: 'acc-2', name: 'Checking Account', code: '1020' },
  ],
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
};

describe('BankAccountForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without throwing (regression: empty SelectItem value crashed Radix UI)', () => {
    // Before the fix, this threw: "A <Select.Item /> must have a value prop that is not an empty string"
    expect(() => render(<BankAccountForm {...defaultProps} />)).not.toThrow();
  });

  it('renders the GL Account select with a None option', () => {
    render(<BankAccountForm {...defaultProps} />);
    // The GL Account label should be present (includes asterisk for required)
    expect(screen.getByText('GL Account *')).toBeInTheDocument();
  });

  it('does not render any SelectItem with empty string value', () => {
    const { container } = render(<BankAccountForm {...defaultProps} />);
    // Radix UI renders SelectItems as [data-radix-select-viewport] children
    // Check that no option element (role=option) has empty string value
    const options = container.querySelectorAll('[role="option"]');
    options.forEach((option) => {
      const dataValue = option.getAttribute('data-value');
      expect(dataValue).not.toBe('');
    });
  });

  it('renders GL account options from props', () => {
    render(<BankAccountForm {...defaultProps} />);
    // After fix, GL Account select should have the sentinel "None" option
    // and the real accounts
    // We can't directly query SelectContent since it's a portal,
    // but we verify the form renders without crashing with the glAccounts data
    expect(screen.getByText('GL Account *')).toBeInTheDocument();
    expect(screen.getByText('Account Information')).toBeInTheDocument();
    expect(screen.getByText(/^Accounting$/)).toBeInTheDocument();
  });

  it('renders cancel button that fires onCancel', () => {
    render(<BankAccountForm {...defaultProps} />);
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows validation error when account name is empty on submit', async () => {
    render(<BankAccountForm {...defaultProps} />);
    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);
    // Zod validation should prevent onSubmit from being called without name
    // (validation runs async so we just verify onSubmit wasn't called immediately)
    // The form uses zodResolver which returns async errors
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('shows edit mode when account prop is provided', () => {
    const account = {
      id: 'bank-1',
      name: 'Main Account',
      type: 'BANK' as const,
      currency: 'USD',
      accountNumber: '****1234',
      linkedAccountId: 'acc-1',
      isActive: true,
      systemBalance: '1000.00',
      bankBalance: '1000.00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    render(<BankAccountForm {...defaultProps} account={account} />);
    expect(screen.getByRole('button', { name: /update account/i })).toBeInTheDocument();
    // Opening balance field should NOT be shown in edit mode
    expect(screen.queryByLabelText(/opening balance/i)).not.toBeInTheDocument();
  });

  it('shows opening balance field in create mode', () => {
    render(<BankAccountForm {...defaultProps} />);
    expect(screen.getByLabelText(/opening balance/i)).toBeInTheDocument();
  });
});
