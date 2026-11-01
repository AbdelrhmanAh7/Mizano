import React from 'react';
import { render, screen } from '@testing-library/react';
import { TrialBalanceEmpty } from './trial-balance-empty';

jest.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

describe('TrialBalanceEmpty', () => {
  it('explains that nothing is posted yet and links to the first postings', () => {
    render(<TrialBalanceEmpty />);

    expect(screen.getByText('reports.trialBalance.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('reports.trialBalance.emptyBody')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'reports.trialBalance.emptyNewInvoice' })).toHaveAttribute(
      'href',
      '/sales/invoices/new',
    );
    expect(screen.getByRole('link', { name: 'reports.trialBalance.emptyNewJournal' })).toHaveAttribute(
      'href',
      '/accounting/journals/new',
    );
  });
});
