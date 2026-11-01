/**
 * #83: a bill whose request failed showed "not found", so the accountant thought it was deleted.
 * A failed request now shows an error with Retry; "not found" stays for a real 404.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('@/lib/api', () => ({ paymentsMadeApi: { void: jest.fn() } }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
jest.mock('@/lib/hooks/use-journals', () => ({ invalidateLedgerQueries: jest.fn() }));
jest.mock('@/lib/date-locale', () => ({ useDateFnsLocale: () => undefined }));
jest.mock('@/components/shared/document-pdf-actions', () => ({ DocumentPdfActions: () => null }));
jest.mock('@/lib/hooks/use-organization', () => ({
  useBaseCurrency: () => 'EGP',
  documentCurrency: (code: string | null | undefined, base: string | undefined) => code || base,
}));
jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (v: unknown, c?: string | null) => `${c ?? 'EGP'} ${String(v ?? 0)}`,
}));

const mockUseBill = jest.fn();
jest.mock('@/lib/hooks/use-bills', () => ({
  useBill: (id: string) => mockUseBill(id),
  useApproveBill: () => ({ mutateAsync: jest.fn(), isPending: false }),
  getStatusVariant: () => 'default',
  useBillStatusLabel: () => (status: string) => status,
}));

import BillDetailPage from './page';

const query = (overrides: Record<string, unknown>) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
  ...overrides,
});

describe('BillDetailPage states (#83)', () => {
  it('shows an error with Retry, not "not found", when the request fails', () => {
    const refetch = jest.fn();
    mockUseBill.mockReturnValue(
      query({ isError: true, error: { response: { status: 500 } }, refetch }),
    );

    render(<BillDetailPage params={{ id: 'bill-1' }} />);

    expect(screen.getByText('common.errors.generic')).toBeInTheDocument();
    expect(screen.queryByText('common.errors.notFound')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.errors.tryAgain' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('treats a network failure (no response) as an error too', () => {
    mockUseBill.mockReturnValue(query({ isError: true, error: new Error('Network Error') }));

    render(<BillDetailPage params={{ id: 'bill-1' }} />);

    expect(screen.getByRole('button', { name: 'common.errors.tryAgain' })).toBeInTheDocument();
    // The raw error text never reaches the screen.
    expect(screen.queryByText('Network Error')).toBeNull();
  });

  it('keeps "not found" for a bill the server says does not exist', () => {
    mockUseBill.mockReturnValue(query({ isError: true, error: { response: { status: 404 } } }));

    render(<BillDetailPage params={{ id: 'missing' }} />);

    expect(screen.getByText('common.errors.notFound')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.errors.tryAgain' })).toBeNull();
  });
});
