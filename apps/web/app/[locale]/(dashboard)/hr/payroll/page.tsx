'use client';

import { DataTable, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { payrollApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import {
  getPayrollStatusColor,
  getPayrollStatusLabel,
  type PayrollStatus,
  usePayrollRuns,
} from '@/lib/hooks/use-hr';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { CheckCircle2, DollarSign, Eye, FileText, Play, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDateFnsLocale } from '@/lib/date-locale';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

function PayrollPageContent() {
  const formatCurrency = useMoneyFormatter();
  const dateLocale = useDateFnsLocale();
  const t = useTranslations('hr');
  const tCommon = useTranslations('common');
  const tableParams = useTableParams({ defaultSortBy: 'createdAt' });
  const { hasPermission } = usePermissions();
  const {
    data: payrollData,
    isLoading,
    isError,
    refetch,
  } = usePayrollRuns(tableParams.queryParams);
  const payrollRuns = payrollData?.data || [];
  const meta = payrollData?.meta;

  const canEdit = hasPermission('payroll.edit');
  const canDelete = hasPermission('payroll.delete');

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkProcessOpen, setBulkProcessOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<{ id: string }[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => payrollApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['payroll-runs']],
    successMessage: (count) => t('payroll.bulk.deleteSuccess', { count }),
  });

  const bulkProcessAction = useBulkAction({
    mutationFn: (ids) => payrollApi.bulkProcess(ids).then((r) => r.data),
    queryKeys: [['payroll-runs']],
    successMessage: (count) => t('payroll.bulk.processSuccess', { count }),
  });

  const bulkPayAction = useBulkAction({
    mutationFn: (ids) => payrollApi.bulkPay(ids).then((r) => r.data),
    queryKeys: [['payroll-runs']],
    successMessage: (count) => t('payroll.bulk.paySuccess', { count }),
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: t('payroll.bulk.process'),
            icon: Play,
            onClick: (rows: { id: string }[]) => {
              setBulkSelectedRows(rows);
              setBulkProcessOpen(true);
            },
          },
          {
            label: t('payroll.bulk.markPaid'),
            icon: DollarSign,
            onClick: (rows: { id: string }[]) => {
              setBulkSelectedRows(rows);
              setBulkPayOpen(true);
            },
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: t('payroll.bulk.delete'),
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: { id: string }[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  // Calculate summary
  const totalPaid = payrollRuns
    .filter((p: { status: string }) => p.status === 'PAID')
    .reduce((sum: number, p: { totalNetPay?: number }) => sum + (p.totalNetPay || 0), 0);
  const pendingRuns = payrollRuns.filter((p: { status: string }) => p.status === 'DRAFT').length;
  const confirmedRuns = payrollRuns.filter(
    (p: { status: string }) => p.status === 'CONFIRMED',
  ).length;

  const columns: ColumnDef<{
    id: string;
    year: number;
    month: number;
    employeeCount?: number;
    totalGross?: number;
    totalDeductions?: number;
    totalNetPay?: number;
    status: string;
    createdAt: string;
  }>[] = [
    {
      id: 'period',
      header: () => (
        <SortableHeader
          label={t('payroll.table.period')}
          columnId="createdAt"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <span className="font-medium">
          {format(new Date(row.original.year, row.original.month - 1), 'MMMM yyyy', {
            locale: dateLocale,
          })}
        </span>
      ),
    },
    {
      accessorKey: 'employeeCount',
      header: t('payroll.table.employeeCount'),
      cell: ({ row }) => row.original.employeeCount || 0,
    },
    {
      accessorKey: 'totalGross',
      header: t('payroll.grossPay'),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.original.totalGross || 0)}</span>
      ),
    },
    {
      accessorKey: 'totalDeductions',
      header: t('payroll.table.deductions'),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
      cell: ({ row }) => (
        <span className="font-mono text-destructive">
          <span dir="ltr">-{formatCurrency(row.original.totalDeductions || 0)}</span>
        </span>
      ),
    },
    {
      accessorKey: 'totalNetPay',
      header: t('payroll.netPay'),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
      cell: ({ row }) => (
        <span className="font-mono font-medium">
          {formatCurrency(row.original.totalNetPay || 0)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('payroll.table.status'),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={getPayrollStatusColor(row.original.status as PayrollStatus)}
        >
          {getPayrollStatusLabel(row.original.status as PayrollStatus, t)}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: t('payroll.createdColumn'),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {format(new Date(row.original.createdAt), 'PP', { locale: dateLocale })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild aria-label={t('payroll.viewRun')}>
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('payroll.title')}</h1>
          <p className="text-muted-foreground">{t('payroll.listDescription')}</p>
        </div>
        <Button asChild>
          <Link href="/hr/payroll/run">
            <Play className="me-2 h-4 w-4" />
            {t('payroll.newRun')}
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('payroll.totalPaid')}</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info/10 rounded-lg">
                <FileText className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('payroll.runsCount')}</p>
                <p className="text-2xl font-bold">{payrollRuns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <Users className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('payroll.pending')}</p>
                <p className="text-2xl font-bold">{pendingRuns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('payroll.confirmed')}</p>
                <p className="text-2xl font-bold">{confirmedRuns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Runs Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('payroll.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="py-8 text-center space-y-4" role="alert">
              <p className="text-sm text-muted-foreground">{tCommon('table.error')}</p>
              <Button variant="outline" onClick={() => void refetch()}>
                {t('retry')}
              </Button>
            </div>
          ) : (
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
              emptyMessage={t('payroll.empty.title')}
              emptyAction={
                <Button asChild>
                  <Link href="/hr/payroll/run">
                    <Play className="me-2 h-4 w-4" />
                    {t('payroll.newRun')}
                  </Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="payroll runs"
        title={t('payroll.bulk.deleteTitle', { count: bulkSelectedRows.length })}
        description={t('payroll.bulk.deleteDescription')}
        confirmLabel={t('payroll.bulk.deleteConfirm', { count: bulkSelectedRows.length })}
        cancelLabel={tCommon('buttons.cancel')}
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
        title={t('payroll.bulk.processTitle', { count: bulkSelectedRows.length })}
        description={t('payroll.bulk.processDescription')}
        confirmLabel={t('payroll.bulk.processConfirm', { count: bulkSelectedRows.length })}
        cancelLabel={tCommon('buttons.cancel')}
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
        title={t('payroll.bulk.payTitle', { count: bulkSelectedRows.length })}
        description={t('payroll.bulk.payDescription')}
        confirmLabel={t('payroll.bulk.payConfirm', { count: bulkSelectedRows.length })}
        cancelLabel={tCommon('buttons.cancel')}
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
