import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntakeInbox } from './intake-inbox';
import type { IntakeInboxRow } from '@/lib/hooks/use-intake-inbox';

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

let mockCanUse = true;
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => mockCanUse && p === 'purchases.create',
  }),
}));
jest.mock('@/lib/hooks/use-organization', () => ({ useBaseCurrency: () => 'EGP' }));

const mockUseInbox = jest.fn();
const mockBulk = jest.fn();
const mockRetry = jest.fn();
jest.mock('@/lib/hooks/use-intake-inbox', () => ({
  intakeInboxApi: { openOriginal: jest.fn() },
  useIntakeInbox: (params: unknown) => mockUseInbox(params),
  useBulkApproveIntake: () => ({ mutateAsync: mockBulk, isPending: false }),
  useRetryIntakeJob: () => ({ mutateAsync: mockRetry, isPending: false }),
}));

function row(id: string, over: Partial<IntakeInboxRow> = {}, ready = true): IntakeInboxRow {
  return {
    id,
    status: 'EXTRACTED',
    source: 'WEB',
    originalFileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastError: null,
    draftDocumentType: null,
    draftDocumentId: null,
    summary: {
      documentType: 'BILL',
      vendorName: `Vendor ${id}`,
      documentNumber: `INV-${id}`,
      date: '2026-09-01',
      total: '115.0000',
      currency: 'EGP',
      confidence: 0.93,
      readyToApprove: ready,
      blocker: ready ? null : 'NO_VENDOR',
    },
    ...over,
  };
}

function inbox(rows: IntakeInboxRow[]) {
  return {
    data: { data: rows, meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 } },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  };
}

describe('IntakeInbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanUse = true;
    mockUseInbox.mockReturnValue(inbox([row('a'), row('b'), row('c', {}, false)]));
  });

  it('queries the tab statuses and switches between tabs', () => {
    render(<IntakeInbox />);
    expect(mockUseInbox).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: ['EXTRACTED'], page: 1 }),
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.failed' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'tabs.failed' }));
    expect(mockUseInbox).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: ['FAILED', 'DEAD_LETTER'] }),
    );
  });

  it('only lets ready rows be selected and ignores rows with blockers', () => {
    render(<IntakeInbox />);
    expect(screen.getByLabelText(/selectRow.*Vendor c/)).toBeDisabled();
    expect(screen.getByText('blocker.NO_VENDOR')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('selectAll'));
    expect(screen.getByLabelText(/selectRow.*Vendor a/)).toBeChecked();
    expect(screen.getByLabelText(/selectRow.*Vendor b/)).toBeChecked();
    expect(screen.getByLabelText(/selectRow.*Vendor c/)).not.toBeChecked();
    expect(screen.getByRole('button', { name: /approveSelected.*2/ })).toBeEnabled();
  });

  it('shows no selection controls outside the Ready tab', () => {
    mockUseInbox.mockReturnValue(inbox([row('n', { status: 'NEEDS_REVIEW' }, false)]));
    render(<IntakeInbox />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.review' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'tabs.review' }));
    expect(screen.queryByLabelText('selectAll')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approveSelected/ })).not.toBeInTheDocument();
  });

  it('confirms before approving and shows a failure toast per record', async () => {
    mockBulk.mockResolvedValue({
      processed: 1,
      total: 2,
      failures: [{ id: 'b', reason: 'No existing vendor was matched' }],
    });
    render(<IntakeInbox />);
    fireEvent.click(screen.getByLabelText('selectAll'));
    fireEvent.click(screen.getByRole('button', { name: /approveSelected/ }));
    expect(mockBulk).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.confirm' }));
    await waitFor(() => expect(mockBulk).toHaveBeenCalledWith(['a', 'b']));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: 'Vendor b: No existing vendor was matched',
        }),
      ),
    );
  });

  it('offers retry for failed rows', async () => {
    mockUseInbox.mockReturnValue(inbox([row('f', { status: 'FAILED' }, false)]));
    mockRetry.mockResolvedValue(undefined);
    render(<IntakeInbox />);
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith('f'));
  });

  it('keeps loading, empty and error states distinct', () => {
    mockUseInbox.mockReturnValue({ ...inbox([]), data: undefined, isLoading: true });
    const { rerender } = render(<IntakeInbox />);
    expect(screen.getByTestId('inbox-loading')).toBeInTheDocument();

    mockUseInbox.mockReturnValue(inbox([]));
    rerender(<IntakeInbox />);
    expect(screen.getByTestId('inbox-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-error')).not.toBeInTheDocument();

    const refetch = jest.fn();
    mockUseInbox.mockReturnValue({ ...inbox([]), data: undefined, isError: true, refetch });
    rerender(<IntakeInbox />);
    expect(screen.getByTestId('inbox-error')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'error.retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('links to the scan review page and is gated by the API permission', () => {
    const { rerender } = render(<IntakeInbox />);
    expect(screen.getAllByRole('link', { name: /review/ })[0]).toHaveAttribute(
      'href',
      '/purchases/bills/scan?jobId=a',
    );
    mockCanUse = false;
    rerender(<IntakeInbox />);
    expect(screen.getByText('noAccess')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
