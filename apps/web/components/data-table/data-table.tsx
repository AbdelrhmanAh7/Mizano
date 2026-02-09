'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
    type ColumnDef,
    type ColumnSizingState,
    type RowSelectionState,
    type VisibilityState,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Loader2, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTablePagination } from './data-table-pagination';

interface BulkAction<TData> {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'destructive' | 'outline';
  onClick: (rows: TData[]) => void;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  enableSelection?: boolean;
  bulkActions?: BulkAction<TData>[];
  enableColumnVisibility?: boolean;
  enableExport?: boolean;
  exportFilename?: string;
  /** Enable virtual scrolling for large datasets */
  enableVirtualization?: boolean;
  /** Whether there is a next page of data to load (virtual mode) */
  hasNextPage?: boolean;
  /** Whether the next page is currently being fetched (virtual mode) */
  isFetchingNextPage?: boolean;
  /** Callback to load the next page of data (virtual mode) */
  onLoadMore?: () => void;
  /** Height of the virtual scroll container in px (default 600) */
  tableHeight?: number;
  /** Estimated row height in px for the virtualizer (default 48) */
  estimateRowHeight?: number;
  /** Enable column resizing via drag handles */
  enableColumnResizing?: boolean;
  /** Unique table ID for persisting column widths (defaults to exportFilename) */
  tableId?: string;
  /** Callback for full-dataset export (virtual mode) */
  onExportAll?: (format: 'csv' | 'xlsx') => void;
}

// ─── Column Width Persistence ───────────────────────────────────────────────

const STORAGE_PREFIX = 'mizano-table-';

function loadColumnSizing(tableId: string): ColumnSizingState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tableId}-columns`);
    if (raw) return JSON.parse(raw) as ColumnSizingState;
  } catch {
    // Ignore corrupt storage
  }
  return {};
}

function saveColumnSizing(tableId: string, sizing: ColumnSizingState) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tableId}-columns`, JSON.stringify(sizing));
  } catch {
    // Ignore full storage
  }
}

// ─── CSV Export Utility ─────────────────────────────────────────────────────

function exportToCsv<TData>(data: TData[], columns: ColumnDef<TData, unknown>[], filename: string) {
  const visibleColumns = columns.filter((col) => col.id !== 'select' && col.id !== 'actions');

  const headers = visibleColumns.map((col) => {
    if (typeof col.header === 'string') return col.header;
    if ('accessorKey' in col && col.accessorKey) return String(col.accessorKey);
    return col.id || '';
  });

  const rows = data.map((row) =>
    visibleColumns.map((col) => {
      const key = 'accessorKey' in col ? (col.accessorKey as string) : col.id;
      if (!key) return '';
      const value = (row as Record<string, unknown>)[key];
      if (value == null) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }),
  );

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── DataTable Component ────────────────────────────────────────────────────

export function DataTable<TData, TValue>({
  columns,
  data,
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 20,
  onPageChange,
  onLimitChange,
  isLoading,
  emptyMessage = 'No results found.',
  emptyAction,
  onRowClick,
  enableSelection = false,
  bulkActions,
  enableColumnVisibility = false,
  enableExport = false,
  exportFilename = 'export',
  enableVirtualization = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  tableHeight = 600,
  estimateRowHeight = 48,
  enableColumnResizing = false,
  tableId,
  onExportAll,
}: DataTableProps<TData, TValue>) {
  const resolvedTableId = tableId || exportFilename;
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() =>
    enableColumnResizing ? loadColumnSizing(resolvedTableId) : {},
  );

  // Persist column widths when they change
  useEffect(() => {
    if (enableColumnResizing && Object.keys(columnSizing).length > 0) {
      saveColumnSizing(resolvedTableId, columnSizing);
    }
  }, [columnSizing, enableColumnResizing, resolvedTableId]);

  const parentRef = useRef<HTMLDivElement>(null);

  const allColumns = useMemo(() => {
    if (!enableSelection) return columns;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 40,
      minSize: 40,
      maxSize: 40,
    };
    return [selectColumn as ColumnDef<TData, TValue>, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    state: {
      rowSelection,
      columnVisibility,
      ...(enableColumnResizing ? { columnSizing } : {}),
    },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    ...(enableColumnResizing
      ? {
          enableColumnResizing: true,
          columnResizeMode: 'onChange' as const,
          onColumnSizingChange: setColumnSizing,
        }
      : {}),
    enableRowSelection: enableSelection,
  });

  const { rows: tableRows } = table.getRowModel();

  // ─── Virtualizer ────────────────────────────────────────────────────────

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 15,
    enabled: enableVirtualization,
  });

  // Infinite scroll: load more when near bottom
  useEffect(() => {
    if (!enableVirtualization || !onLoadMore || !hasNextPage || isFetchingNextPage) return;

    const el = parentRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 300) {
        onLoadMore();
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [enableVirtualization, onLoadMore, hasNextPage, isFetchingNextPage]);

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  const hasSelection = selectedRows.length > 0;
  const showToolbar =
    enableColumnVisibility || enableExport || onExportAll || (enableSelection && hasSelection);

  const handleExport = useCallback(() => {
    exportToCsv(data, columns as ColumnDef<TData, unknown>[], exportFilename);
  }, [data, columns, exportFilename]);

  const handleResetColumns = useCallback(() => {
    setColumnSizing({});
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${resolvedTableId}-columns`);
    } catch {
      // Ignore
    }
  }, [resolvedTableId]);

  // ─── Loading State ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // ─── Empty State ────────────────────────────────────────────────────────

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  // ─── Toolbar ────────────────────────────────────────────────────────────

  const toolbar = showToolbar ? (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {hasSelection && (
          <>
            <span className="text-sm text-muted-foreground">{selectedRows.length} selected</span>
            {bulkActions?.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  variant={action.variant || 'outline'}
                  size="sm"
                  onClick={() => action.onClick(selectedRows)}
                >
                  {Icon && <Icon className="h-4 w-4 me-1" />}
                  {action.label}
                </Button>
              );
            })}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Current-page CSV export (non-virtual) */}
        {enableExport && !enableVirtualization && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 me-1" />
            Export CSV
          </Button>
        )}

        {/* Full-dataset export (virtual mode) */}
        {onExportAll && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 me-1" />
                Export All
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => onExportAll('csv')}>
                Export as CSV
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => onExportAll('xlsx')}>
                Export as XLSX
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {enableColumnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="h-4 w-4 me-1" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value: boolean) => column.toggleVisibility(!!value)}
                    className="capitalize"
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              {enableColumnResizing && (
                <>
                  <DropdownMenuCheckboxItem
                    checked={false}
                    onCheckedChange={handleResetColumns}
                    className="text-muted-foreground"
                  >
                    Reset column widths
                  </DropdownMenuCheckboxItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  ) : null;

  // ─── Shared header rendering ────────────────────────────────────────────

  const headerContent = table.getHeaderGroups().map((headerGroup) => (
    <TableRow key={headerGroup.id}>
      {headerGroup.headers.map((header) => (
        <TableHead
          key={header.id}
          className={cn(
            (header.column.columnDef.meta as Record<string, string> | undefined)?.headerClassName,
            enableColumnResizing && 'relative',
          )}
          style={
            enableColumnResizing
              ? { width: header.getSize(), minWidth: header.column.columnDef.minSize }
              : undefined
          }
        >
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
          {/* Column resize handle */}
          {enableColumnResizing && header.column.getCanResize() && (
            <div
              onMouseDown={header.getResizeHandler()}
              onTouchStart={header.getResizeHandler()}
              className={cn(
                'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none',
                'bg-transparent hover:bg-primary/30 transition-colors',
                header.column.getIsResizing() && 'bg-primary/50',
              )}
            />
          )}
        </TableHead>
      ))}
    </TableRow>
  ));

  // ─── Virtual Table Rendering ────────────────────────────────────────────

  if (enableVirtualization) {
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();

    return (
      <div className="space-y-4">
        {toolbar}

        <div className="rounded-md border">
          <div
            ref={parentRef}
            className="overflow-auto"
            style={{ height: tableHeight, maxHeight: '80vh' }}
          >
            <table
              className="w-full caption-bottom text-sm"
              style={
                enableColumnResizing
                  ? { width: table.getCenterTotalSize(), minWidth: '100%' }
                  : { minWidth: '100%' }
              }
            >
              <thead className="sticky top-0 z-10 bg-background border-b [&_tr]:border-b">
                {headerContent}
              </thead>
              <tbody>
                {/* Top spacer */}
                {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      style={{ height: virtualItems[0].start }}
                    />
                  </tr>
                )}

                {/* Virtual rows */}
                {virtualItems.map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  return (
                    <TableRow
                      key={row.id}
                      data-index={virtualRow.index}
                      ref={(node) => virtualizer.measureElement(node)}
                      data-state={row.getIsSelected() && 'selected'}
                      onClick={() => onRowClick?.(row.original)}
                      className={onRowClick ? 'cursor-pointer' : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={
                            (cell.column.columnDef.meta as Record<string, string> | undefined)
                              ?.cellClassName
                          }
                          style={
                            enableColumnResizing ? { width: cell.column.getSize() } : undefined
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}

                {/* Bottom spacer */}
                {virtualItems.length > 0 &&
                  totalSize - virtualItems[virtualItems.length - 1].end > 0 && (
                    <tr>
                      <td
                        colSpan={table.getVisibleLeafColumns().length}
                        style={{
                          height: totalSize - virtualItems[virtualItems.length - 1].end,
                        }}
                      />
                    </tr>
                  )}

                {/* Loading indicator for next page */}
                {isFetchingNextPage && (
                  <tr>
                    <td colSpan={table.getVisibleLeafColumns().length} className="text-center py-4">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading more...</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Virtual mode footer: total count + scroll indicator */}
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            {total > 0
              ? `Showing ${data.length} of ${total} results`
              : `${data.length} results loaded`}
          </div>
          {hasNextPage && <span className="text-sm text-muted-foreground">Scroll for more</span>}
        </div>
      </div>
    );
  }

  // ─── Standard (Non-Virtual) Table Rendering ─────────────────────────────

  return (
    <div className="space-y-4">
      {toolbar}

      <div className="rounded-md border">
        <Table
          style={
            enableColumnResizing
              ? { width: table.getCenterTotalSize(), minWidth: '100%' }
              : undefined
          }
        >
          <TableHeader>{headerContent}</TableHeader>
          <TableBody>
            {tableRows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                onClick={() => onRowClick?.(row.original)}
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={
                      (cell.column.columnDef.meta as Record<string, string> | undefined)
                        ?.cellClassName
                    }
                    style={enableColumnResizing ? { width: cell.column.getSize() } : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {onPageChange && (
        <DataTablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}
