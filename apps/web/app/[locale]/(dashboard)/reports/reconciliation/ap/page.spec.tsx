import React from 'react';
import { render, screen } from '@testing-library/react';
import APReconciliationPage from './page';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'apReconciliation.title': 'AP Reconciliation',
      'apReconciliation.check': 'Reconciliation Check',
      'apReconciliation.description': 'Reconcile AP subledger with control account',
      'apReconciliation.reconciled': 'Reconciled',
      'apReconciliation.unbalanced': 'Unbalanced',
      'apReconciliation.subledgerTotal': 'Subledger Total',
      'apReconciliation.controlBalance': 'Control Balance',
      'apReconciliation.difference': 'Difference',
      'apReconciliation.asOfDate': 'As of Date',
      'apReconciliation.currency': 'Currency',
      'actions.refresh': 'Refresh',
      'table.error': 'Failed to load report data',
      'dashboard.tryAgain': 'Try again',
    };
    return translations[key] || key;
  },
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('asOf=2026-03-31'),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseApReconciliation = jest.fn();
jest.mock('@/lib/hooks/use-reports', () => ({
  useApReconciliation: (...args: unknown[]) => mockUseApReconciliation(...args),
}));

describe('@issue-125 APReconciliationPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders reconciliation check and balanced metrics when ok is true', () => {
    mockUseApReconciliation.mockReturnValue({
      data: {
        asOf: '2026-03-31',
        currencyCode: 'SAR',
        subledgerTotal: '1500.0000',
        controlBalance: '1500.0000',
        difference: '0.0000',
        ok: true,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<APReconciliationPage />);

    expect(screen.getByText('AP Reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Reconciliation Check')).toBeInTheDocument();
    expect(screen.getByText('Reconciled')).toBeInTheDocument();
    expect(screen.getAllByText('1500.0000').length).toBe(2);
    expect(screen.getByText('0.0000')).toBeInTheDocument();
  });

  it('renders unbalanced status with difference when ok is false', () => {
    mockUseApReconciliation.mockReturnValue({
      data: {
        asOf: '2026-03-31',
        currencyCode: 'SAR',
        subledgerTotal: '1500.0000',
        controlBalance: '1450.0000',
        difference: '50.0000',
        ok: false,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<APReconciliationPage />);

    expect(screen.getByText('Unbalanced')).toBeInTheDocument();
    expect(screen.getByText('50.0000')).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const mockRefetch = jest.fn();
    mockUseApReconciliation.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });

    render(<APReconciliationPage />);

    expect(screen.getByText('Failed to load report data')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });
});
