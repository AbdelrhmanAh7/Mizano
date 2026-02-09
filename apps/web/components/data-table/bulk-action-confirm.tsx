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

interface BulkActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The action verb (e.g. "delete", "send", "void") */
  action: string;
  /** Number of selected items */
  count: number;
  /** Item type label (e.g. "invoices", "bills") */
  itemType: string;
  /** Additional description / warning text */
  description?: string;
  /** Whether the action is destructive (button turns red) */
  destructive?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
}

export function BulkActionConfirmDialog({
  open,
  onOpenChange,
  action,
  count,
  itemType,
  description,
  destructive = false,
  isLoading = false,
  onConfirm,
}: BulkActionConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action.charAt(0).toUpperCase() + action.slice(1)} {count} {itemType}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ||
              `Are you sure you want to ${action} ${count} ${itemType}? This action cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // Prevent dialog from closing before async completes
              onConfirm();
            }}
            disabled={isLoading}
            className={destructive ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600' : undefined}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action.charAt(0).toUpperCase() + action.slice(1)} {count} {itemType}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
