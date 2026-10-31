'use client';

import { useState } from 'react';

interface BulkRunner {
  execute: (ids: string[]) => Promise<unknown>;
  isLoading: boolean;
}

/**
 * State of one bulk-action confirmation on a list page: the rows it was opened for, and the
 * props `BulkActionConfirmDialog` needs. Confirming runs the bulk action on those rows, closes
 * the dialog and calls `onDone` (usually the list's refetch); a failed run leaves it open.
 */
export function useBulkConfirm<TRow extends { id: string }>(
  action: BulkRunner,
  onDone: () => void,
): {
  count: number;
  openFor: (rows: TRow[]) => void;
  dialogProps: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    count: number;
    isLoading: boolean;
    onConfirm: () => Promise<void>;
  };
} {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TRow[]>([]);

  return {
    count: rows.length,
    openFor: (selected) => {
      setRows(selected);
      setOpen(true);
    },
    dialogProps: {
      open,
      onOpenChange: setOpen,
      count: rows.length,
      isLoading: action.isLoading,
      onConfirm: async () => {
        await action.execute(rows.map((r) => r.id));
        setOpen(false);
        onDone();
      },
    },
  };
}
