import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntakeInbox } from './intake-inbox';
import type { IntakeInboxRow } from '@/lib/hooks/use-intake-inbox';

import enPurchases from '../../messages/en/purchases.json';
import arPurchases from '../../messages/ar/purchases.json';

type LocaleData = {
  inbox: {
    blocker: Record<string, string>;
  };
};

const allLocales: Record<string, LocaleData> = {
  en: enPurchases as unknown as LocaleData,
  ar: arPurchases as unknown as LocaleData,
};
let currentMockLocale = 'en';

jest.mock('next-intl', () => ({
  useLocale: () => currentMockLocale,
  useTranslations: (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      // Very simple mock translation lookup
      if (namespace === 'purchases.inbox' && key.startsWith('blocker.')) {
        const code = key.split('.')[1];
        return allLocales[currentMockLocale]?.inbox?.blocker?.[code] || key;
      }
      return values ? `${key}:${JSON.stringify(values)}` : key;
    };
    t.has = (key: string) => {
      if (namespace === 'purchases.inbox' && key.startsWith('blocker.')) {
        const code = key.split('.')[1];
        return !!allLocales[currentMockLocale]?.inbox?.blocker?.[code];
      }
      return true; // Mock true for other things
    };
    return t;
  },
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
const mockOpenOriginal = jest.fn();
jest.mock('@/lib/hooks/use-intake-inbox', () => ({
  intakeInboxApi: { openOriginal: (id: string) => mockOpenOriginal(id) },
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
    expect(screen.getByText(enPurchases.inbox.blocker.NO_VENDOR)).toBeInTheDocument();
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

  it('shows an error toast when the original-file tab cannot be opened', async () => {
    mockOpenOriginal.mockRejectedValueOnce(new Error('Could not open the original file'));
    render(<IntakeInbox />);
    fireEvent.click(screen.getByRole('button', { name: 'viewOriginalFor:{"name":"a.pdf"}' }));
    // The real opener must be called during the click, before any asynchronous work.
    expect(mockOpenOriginal).toHaveBeenCalledWith('a');
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'toast.originalFailed',
      }),
    );
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

  it('renders localized messages for every blocker code from the real message files with no MISSING key', async () => {
    const enBlockers = enPurchases.inbox.blocker;
    const arBlockers = arPurchases.inbox.blocker;
    const codes = Object.keys(enBlockers);
    expect(codes.length).toBeGreaterThan(0);

    for (const code of codes) {
      const enText = enBlockers[code as keyof typeof enBlockers];
      const arText = arBlockers[code as keyof typeof arBlockers];
      expect(enText).toBeTruthy();
      expect(arText).toBeTruthy();
      expect(enText).not.toContain('MISSING');
      expect(arText).not.toContain('MISSING');
    }

    const testCode = codes[0];
    const expectedEnMsg = enBlockers[testCode as keyof typeof enBlockers];
    mockBulk.mockResolvedValue({
      processed: 0,
      total: 1,
      failures: [{ id: 'a', code: testCode, reason: 'Fallback reason' }],
    });

    currentMockLocale = 'en';
    const { unmount } = render(<IntakeInbox />);
    fireEvent.click(screen.getByLabelText('selectAll'));
    fireEvent.click(screen.getByRole('button', { name: /approveSelected/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.confirm' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: `Vendor a: ${expectedEnMsg}`,
        }),
      ),
    );
    unmount();

    currentMockLocale = 'ar';
    const expectedArMsg = arBlockers[testCode as keyof typeof arBlockers];
    render(<IntakeInbox />);
    fireEvent.click(screen.getByLabelText('selectAll'));
    fireEvent.click(screen.getByRole('button', { name: /approveSelected/ }));
    const dialogAr = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogAr).getByRole('button', { name: 'confirm.confirm' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: `Vendor a: ${expectedArMsg}`,
        }),
      ),
    );
  });
});
