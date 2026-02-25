'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Plus, MoreHorizontal, Pencil, Trash2, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Badge } from '@/components/ui/badge';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useBankRules,
  useDeleteBankRule,
  useUpdateBankRule,
  getConditionFieldLabel,
  getConditionOperatorLabel,
  getActionTypeLabel,
  BankRule,
} from '@/lib/hooks/use-bank-rules';

function BankRulesPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'name' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useBankRules({ ...tableParams.queryParams });
  const deleteRule = useDeleteBankRule();
  const updateRule = useUpdateBankRule();

  const rules: BankRule[] = data?.data || [];
  const meta = data?.meta;

  const handleDelete = async () => {
    if (deleteId) {
      await deleteRule.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (rule: BankRule) => {
    await updateRule.mutateAsync({
      id: rule.id,
      data: { isActive: !rule.isActive },
    });
  };

  const columns: ColumnDef<BankRule>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label="Name"
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      id: 'conditions',
      header: 'Conditions',
      cell: ({ row }) => (
        <div className="space-y-1">
          {row.original.conditions.map((condition, idx) => (
            <p key={idx} className="text-sm">
              <span className="text-muted-foreground">
                {getConditionFieldLabel(condition.field)}
              </span>{' '}
              <span className="font-medium">{getConditionOperatorLabel(condition.operator)}</span>{' '}
              <span className="font-mono bg-muted px-1 rounded">{condition.value}</span>
            </p>
          ))}
        </div>
      ),
    },
    {
      id: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <Badge variant="outline">{getActionTypeLabel(row.original.action.type)}</Badge>
      ),
    },
    {
      accessorKey: 'hitCount',
      header: 'Hits',
      meta: { headerClassName: 'text-center', cellClassName: 'text-center font-mono' },
      cell: ({ row }) => row.original.hitCount,
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      meta: { headerClassName: 'text-center', cellClassName: 'text-center' },
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <button onClick={() => handleToggleActive(rule)} className="inline-flex items-center">
            {rule.isActive ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                <ToggleRight className="mr-1 h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="hover:bg-secondary/80">
                <ToggleLeft className="mr-1 h-3 w-3" />
                Inactive
              </Badge>
            )}
          </button>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/banking/rules/${rule.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(rule.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bank Rules</h1>
          <p className="text-muted-foreground">
            Automate transaction categorization with custom rules
          </p>
        </div>
        <Button asChild>
          <Link href="/banking/rules/new">
            <Plus className="mr-2 h-4 w-4" />
            New Rule
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search rules..."
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rules}
        page={meta?.page || 1}
        totalPages={meta?.totalPages || 1}
        total={meta?.total || 0}
        limit={tableParams.limit}
        onPageChange={tableParams.setPage}
        onLimitChange={tableParams.setLimit}
        isLoading={isLoading}
        emptyMessage="No rules yet"
        emptyAction={
          <Button asChild>
            <Link href="/banking/rules/new">Create Rule</Link>
          </Button>
        }
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function BankRulesPage() {
  return (
    <Suspense>
      <BankRulesPageContent />
    </Suspense>
  );
}
