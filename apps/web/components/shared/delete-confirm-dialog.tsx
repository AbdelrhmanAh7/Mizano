'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entity name being deleted (e.g. "Invoice INV-001", "Customer") */
  entityName: string;
  /** Optional description override */
  description?: string;
  /** Loading state while delete is in progress */
  isLoading?: boolean;
  /** Called when user confirms deletion */
  onConfirm: () => void;
}

/**
 * Reusable single-item delete confirmation dialog.
 *
 * Replaces 30+ duplicate AlertDialog patterns across list/detail pages.
 *
 * Usage:
 *   <DeleteConfirmDialog
 *     open={deleteOpen}
 *     onOpenChange={setDeleteOpen}
 *     entityName={`Invoice ${invoice.invoiceNumber}`}
 *     isLoading={isDeleting}
 *     onConfirm={handleDelete}
 *   />
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  entityName,
  description,
  isLoading = false,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entityName}?</AlertDialogTitle>
          <AlertDialogDescription>
            {description ||
              `Are you sure you want to delete this ${entityName.toLowerCase()}? This action cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive"
          >
            {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
