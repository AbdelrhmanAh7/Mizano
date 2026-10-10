import React from 'react';
import { render, screen } from '@testing-library/react';

let capturedBulkActions: Array<{ label: string }> = [];

jest.mock('@/components/data-table', () => ({
  DataTable: (props: { bulkActions?: Array<{ label: string }> }) => {
    capturedBulkActions = props.bulkActions || [];
    return <div data-testid="data-table">DataTable Mock</div>;
  },
  DataTableSearch: () => null,
  DataTableFacetedFilter: () => null,
  DataTableDateRangeFilter: () => null,
  SortableHeader: () => null,
}));

jest.mock('@/components/data-table/bulk-action-confirm', () => ({
  BulkActionConfirmDialog: () => null,
}));

jest.mock('@/components/ai', () => ({
  CollectionPriorityCard: () => null,
}));

jest.mock('@/components/tour/auto-tour-trigger', () => ({
  AutoTourTrigger: () => null,
}));

jest.mock('@/components/import/import-wizard', () => ({
  ImportWizard: () => null,
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockHasPermission = jest.fn();
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasPermission: mockHasPermission,
  }),
}));

jest.mock('@/lib/hooks/use-table-params', () => ({
  useTableParams: () => ({
    queryParams: {},
    filters: {},
  }),
}));

jest.mock('@/lib/hooks/use-export-all', () => ({
  useExportAll: () => ({
    onExportAll: jest.fn(),
  }),
}));

jest.mock('@/lib/hooks/use-invoices', () => ({
  useInfiniteInvoices: () => ({
    data: [],
    total: 0,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useCloneInvoice: () => ({ mutateAsync: jest.fn() }),
  useDeleteInvoice: () => ({ mutateAsync: jest.fn() }),
  useSendInvoice: () => ({ mutateAsync: jest.fn() }),
  useVoidInvoice: () => ({ mutateAsync: jest.fn() }),
  getInvoiceStatusColor: () => '',
  getInvoiceStatusLabel: () => '',
}));

jest.mock('@/lib/hooks/use-bulk-action', () => ({
  useBulkAction: () => ({
    execute: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

import InvoicesPage from './page';

describe('InvoicesPage bulk actions', () => {
  beforeEach(() => {
    capturedBulkActions = [];
    jest.clearAllMocks();
  });

  it('bulk-pay hidden for edit-only role', () => {
    // Role has sales.edit and sales.delete, but lacks sales.create
    mockHasPermission.mockImplementation((perm: string) => {
      if (perm === 'sales.edit') return true;
      if (perm === 'sales.delete') return true;
      if (perm === 'sales.create') return false;
      return false;
    });

    render(<InvoicesPage />);

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    const actionLabels = capturedBulkActions.map((a) => a.label);
    expect(actionLabels).toContain('Send');
    expect(actionLabels).toContain('Void');
    expect(actionLabels).not.toContain('Mark as Paid');
  });

  it('bulk-pay shown when role has sales.create', () => {
    mockHasPermission.mockImplementation((perm: string) => {
      if (perm === 'sales.create') return true;
      if (perm === 'sales.edit') return true;
      return false;
    });

    render(<InvoicesPage />);

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    const actionLabels = capturedBulkActions.map((a) => a.label);
    expect(actionLabels).toContain('Mark as Paid');
  });
});
