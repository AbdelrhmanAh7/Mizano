import React from 'react';
import { render, screen } from '@testing-library/react';
import ReportsPage from './page';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Reports',
      description: 'Financial reports and analytics',
      'categories.financial': 'Financial Reports',
      'categories.sales': 'Sales Reports',
      'categories.tax': 'Tax Reports',
      'profitLoss.title': 'Profit & Loss',
      'profitLoss.description': 'Income and expense summary',
      'balanceSheet.title': 'Balance Sheet',
      'balanceSheet.description': 'Assets, liabilities, and equity',
      'cashFlow.title': 'Cash Flow Statement',
      'cashFlow.description': 'Cash inflows and outflows',
      'arAging.title': 'AR Aging',
      'arAging.description': 'Accounts receivable aging',
      'apAging.title': 'AP Aging',
      'apAging.description': 'Accounts payable aging',
      'salesByCustomer.title': 'Sales by Customer',
      'salesByCustomer.description': 'Sales breakdown by customer',
      'salesByItem.title': 'Sales by Item',
      'salesByItem.description': 'Sales breakdown by item',
      'purchasesByVendor.title': 'Purchases by Vendor',
      'purchasesByVendor.description': 'Purchases breakdown by vendor',
      'generalLedger.title': 'General Ledger',
      'generalLedger.description': 'Detailed account transactions',
      'trialBalance.title': 'Trial Balance',
      'trialBalance.description': 'Account balances verification',
      'vatReport.title': 'VAT Return',
      'vatReport.description': 'VAT summary and draft for filing',
    };
    return translations[key] ?? key;
  },
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

describe('ReportsPage', () => {
  it('renders report categories including Tax Reports with VAT Return link', () => {
    render(<ReportsPage />);

    expect(screen.getByText('Tax Reports')).toBeInTheDocument();
    expect(screen.getByText('VAT Return')).toBeInTheDocument();

    const vatLink = screen.getByRole('link', { name: /vat return/i });
    expect(vatLink).toHaveAttribute('href', '/tax/returns/generate');
  });
});
