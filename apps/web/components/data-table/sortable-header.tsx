'use client';

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SortOrder } from '@/lib/types/table';

interface SortableHeaderProps {
  label: string;
  columnId: string;
  currentSortBy?: string;
  currentSortOrder?: SortOrder;
  onSort?: (columnId: string) => void;
  className?: string;
}

export function SortableHeader({
  label,
  columnId,
  currentSortBy,
  currentSortOrder,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = currentSortBy === columnId;

  if (!onSort) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-3 h-8', className)}
      onClick={() => onSort(columnId)}
    >
      {label}
      {isActive ? (
        currentSortOrder === 'asc' ? (
          <ArrowUp className="ml-2 h-4 w-4" />
        ) : (
          <ArrowDown className="ml-2 h-4 w-4" />
        )
      ) : (
        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
      )}
    </Button>
  );
}
