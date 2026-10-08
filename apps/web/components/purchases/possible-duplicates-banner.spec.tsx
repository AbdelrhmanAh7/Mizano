import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DuplicateCheckResult } from '@mizano/shared-types';
import { PossibleDuplicatesBanner } from './possible-duplicates-banner';
import enPurchases from '@/messages/en/purchases.json';
import arPurchases from '@/messages/ar/purchases.json';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const query: { data?: DuplicateCheckResult; isError: boolean; refetch: jest.Mock } = {
  isError: false,
  refetch: jest.fn(),
};
const usePossibleDuplicates = jest.fn((_target: unknown) => query);
jest.mock('@/lib/hooks/use-bills', () => ({
  ...jest.requireActual('@/lib/hooks/use-bills'),
  usePossibleDuplicates: (target: unknown) => usePossibleDuplicates(target),
}));

let canView = true;
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (key: string) => canView && key === 'purchases.view' }),
}));

const possible: DuplicateCheckResult = {
  status: 'possible',
  matches: [
    {
      billId: 'bill-1',
      billNumber: 'BILL-007',
      documentDate: '2026-10-05',
      amount: '100.1000',
      currency: 'EGP',
    },
  ],
};

describe('PossibleDuplicatesBanner', () => {
  beforeEach(() => {
    query.data = undefined;
    query.isError = false;
    query.refetch.mockReset();
    usePossibleDuplicates.mockClear();
    canView = true;
  });

  it('@issue-96 does not check or show anything without purchases.view', () => {
    canView = false;
    query.data = possible;
    query.isError = true;
    const { container } = render(<PossibleDuplicatesBanner target={{ billId: 'draft-1' }} />);
    expect(container).toBeEmptyDOMElement();
    expect(usePossibleDuplicates).not.toHaveBeenCalled();
  });

  it('checks a stored bill by ID or an unsaved intake draft by its fields', () => {
    render(<PossibleDuplicatesBanner target={{ billId: 'draft-1' }} />);
    const draft = {
      vendorName: 'شركة الأمل',
      amount: '100.1',
      date: '2026-10-06',
      currency: 'EGP',
    };
    render(<PossibleDuplicatesBanner target={{ draft }} />);
    expect(usePossibleDuplicates.mock.calls.map(([target]) => target)).toEqual([
      { billId: 'draft-1' },
      { draft },
    ]);
  });

  it('lists each possible duplicate with a link, date and amount', () => {
    query.data = possible;
    render(<PossibleDuplicatesBanner target={{ billId: 'draft-1' }} />);
    expect(screen.getByTestId('possible-duplicates')).toHaveTextContent('title');
    expect(screen.getByRole('link', { name: 'BILL-007' })).toHaveAttribute(
      'href',
      '/purchases/bills/bill-1',
    );
    expect(screen.getByText('2026-10-05')).toBeInTheDocument();
    expect(screen.getByText(/100\.10/)).toBeInTheDocument();
  });

  it('can be dismissed', () => {
    query.data = possible;
    render(<PossibleDuplicatesBanner target={{ billId: 'draft-1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(screen.queryByTestId('possible-duplicates')).not.toBeInTheDocument();
  });

  it.each([
    ['loading', undefined],
    ['no match', { status: 'none', matches: [] }],
    ['an unknown result', { status: 'unknown', matches: [] }],
  ] as const)('renders nothing for %s', (_label, data) => {
    query.data = data as DuplicateCheckResult | undefined;
    const { container } = render(<PossibleDuplicatesBanner target={{ billId: 'draft-1' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a failed check with Retry instead of hiding it', () => {
    query.isError = true;
    render(<PossibleDuplicatesBanner target={{ billId: 'draft-1' }} />);
    expect(screen.getByTestId('possible-duplicates-error')).toHaveTextContent('checkFailed');
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('has the copy in English and Arabic', () => {
    for (const messages of [enPurchases, arPurchases]) {
      expect(Object.keys(messages.bills.duplicates).sort()).toEqual(
        ['body', 'checkFailed', 'dismiss', 'retry', 'title'].sort(),
      );
      for (const value of Object.values(messages.bills.duplicates)) {
        expect(value).toEqual(expect.any(String));
      }
    }
  });
});
