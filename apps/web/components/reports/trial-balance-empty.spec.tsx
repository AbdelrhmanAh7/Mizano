import React from 'react';
import { render, screen } from '@testing-library/react';
import { TrialBalanceEmpty } from './trial-balance-empty';

jest.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

let mockAllowed: string[] = [];
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (p: string) => mockAllowed.includes(p) }),
}));

describe('TrialBalanceEmpty', () => {
  beforeEach(() => {
    mockAllowed = ['sales.create', 'accounting.create'];
  });

  it('explains that nothing is posted yet and links to the first postings', () => {
    render(<TrialBalanceEmpty />);

    expect(screen.getByText('reports.trialBalance.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('reports.trialBalance.emptyBody')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'reports.trialBalance.emptyNewInvoice' }),
    ).toHaveAttribute('href', '/sales/invoices/new');
    expect(
      screen.getByRole('link', { name: 'reports.trialBalance.emptyNewJournal' }),
    ).toHaveAttribute('href', '/accounting/journals/new');
  });

  it('offers only the postings the user may make', () => {
    mockAllowed = ['accounting.create'];
    render(<TrialBalanceEmpty />);

    expect(screen.queryByRole('link', { name: 'reports.trialBalance.emptyNewInvoice' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'reports.trialBalance.emptyNewJournal' }),
    ).toBeInTheDocument();
  });

  it('shows only the explanation to a read-only user', () => {
    mockAllowed = [];
    render(<TrialBalanceEmpty />);

    expect(screen.getByText('reports.trialBalance.emptyTitle')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
