'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** The view / edit / delete menu at the end of a list row; labels come from the page. */
export function RowActionsMenu({
  viewHref,
  editHref,
  onDelete,
  labels,
}: {
  viewHref: string;
  editHref: string;
  onDelete: () => void;
  labels: { view: string; edit: string; delete: string };
}): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={viewHref}>
            <Eye className="mr-2 h-4 w-4" />
            {labels.view}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={editHref}>
            <Pencil className="mr-2 h-4 w-4" />
            {labels.edit}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-red-600" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          {labels.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
