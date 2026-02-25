'use client';

import { DataTable, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { payrollApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import {
  formatCurrency,
  getPayrollStatusColor,
  getPayrollStatusLabel,
  usePayrollRuns,
} from '@/lib/hooks/use-hr';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { CheckCircle2, DollarSign, Eye, FileText, Play, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function PayrollPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'createdAt' });
  const { hasPermission } = usePermissions();
  const { data: payrollData, isLoading, refetch } = usePayrollRuns(tableParams.queryParams);
  const payrollRuns = payrollData?.data || [];
  const meta = payrollData?.meta;

  const canEdit = hasPermission('payroll.edit');
  const canDelete = hasPermission('payroll.delete');

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkProcessOpen, setBulkProcessOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<any[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => payrollApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['payroll-runs']],
    successMessage: '{count} payroll runs deleted',
  });

  const bulkProcessAction = useBulkAction({
    mutationFn: (ids) => payrollApi.bulkProcess(ids).then((r) => r.data),
    queryKeys: [['payroll-runs']],
    successMessage: '{count} payroll runs processed',
  });

  const bulkPayAction = useBulkAction({
    mutationFn: (ids) => payrollApi.bulkPay(ids).then((r) => r.data),
    queryKeys: [['payroll-runs']],
    successMessage: '{count} payroll runs marked as paid',
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Process',
            icon: Play,
            onClick: (rows: any[]) => {
              setBulkSelectedRows(rows);
              setBulkProcessOpen(true);
            },
          },
          {
            label: 'Mark as Paid',
            icon: DollarSign,
            onClick: (rows: any[]) => {
              setBulkSelectedRows(rows);
              setBulkPayOpen(true);
            },
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: any[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  // Calculate summary
  const totalPaid = payrollRuns
    .filter((p: any) => p.status === 'PAID')
    .reduce((sum: number, p: any) => sum + (p.totalNetPay || 0), 0);
  const pendingRuns = payrollRuns.filter((p: any) => p.status === 'DRAFT').length;
  const confirmedRuns = payrollRuns.filter((p: any) => p.status === 'CONFIRMED').length;

  const columns: ColumnDef<any>[] = [
    {
      id: 'period',
      header: () => (
        <SortableHeader
          label="Period"
          columnId="createdAt"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <span className="font-medium">
          {format(new Date(row.original.year, row.original.month - 1), 'MMMM yyyy')}
        </span>
      ),
    },
    {
      accessorKey: 'employeeCount',
      header: 'Employees',
      cell: ({ row }) => row.original.employeeCount || 0,
    },
    {
      accessorKey: 'totalGross',
      header: 'Gross Pay',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.original.totalGross || 0)}</span>
      ),
    },
    {
      accessorKey: 'totalDeductions',
      header: 'Deductions',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono text-red-600">
          -{formatCurrency(row.original.totalDeductions || 0)}
        </span>
      ),
    },
    {
      accessorKey: 'totalNetPay',
      header: 'Net Pay',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono font-medium">
          {formatCurrency(row.original.totalNetPay || 0)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={getPayrollStatusColor(row.original.status)}>
          {getPayrollStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {format(new Date(row.original.createdAt), 'MMM d, yyyy')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/hr/payroll/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Manage payroll runs and process employee salaries</p>
        </div>
        <Button asChild>
          <Link href="/hr/payroll/run">
            <Play className="mr-2 h-4 w-4" />
            Run Payroll
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid (YTD)</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payroll Runs</p>
                <p className="text-2xl font-bold">{payrollRuns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Users className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{pendingRuns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold">{confirmedRuns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Runs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll History</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={payrollRuns}
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 1}
            total={meta?.total || 0}
            limit={tableParams.limit}
            onPageChange={tableParams.setPage}
            onLimitChange={tableParams.setLimit}
            isLoading={isLoading}
            enableSelection
            bulkActions={bulkActions}
            emptyMessage="No payroll runs yet"
            emptyAction={
              <Button asChild>
                <Link href="/hr/payroll/run">
                  <Play className="mr-2 h-4 w-4" />
                  Run Payroll
                </Link>
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="payroll runs"
        description="Only draft payroll runs will be deleted."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkProcessOpen}
        onOpenChange={setBulkProcessOpen}
        action="process"
        count={bulkSelectedRows.length}
        itemType="payroll runs"
        description="Draft payroll runs will be processed and calculations confirmed."
        isLoading={bulkProcessAction.isLoading}
        onConfirm={async () => {
          await bulkProcessAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkProcessOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkPayOpen}
        onOpenChange={setBulkPayOpen}
        action="mark as paid"
        count={bulkSelectedRows.length}
        itemType="payroll runs"
        description="Confirmed payroll runs will be marked as paid."
        isLoading={bulkPayAction.isLoading}
        onConfirm={async () => {
          await bulkPayAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkPayOpen(false);
          refetch();
        }}
      />
    </div>
  );
}

export default function PayrollPage() {
  return (
    <Suspense>
      <PayrollPageContent />
    </Suspense>
  );
}
