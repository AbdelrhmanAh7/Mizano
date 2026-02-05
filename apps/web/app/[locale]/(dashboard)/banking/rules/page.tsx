'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBankRules,
  useDeleteBankRule,
  useUpdateBankRule,
  getConditionFieldLabel,
  getConditionOperatorLabel,
  getActionTypeLabel,
  BankRule,
} from '@/lib/hooks/use-bank-rules';

export default function BankRulesPage() {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useBankRules({ search });
  const deleteRule = useDeleteBankRule();
  const updateRule = useUpdateBankRule();

  const rules: BankRule[] = data?.data || [];

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      {rules.length === 0 ? (
        <div className="text-center py-12">
          <Zap className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No rules yet</h3>
          <p className="text-muted-foreground">
            Create your first rule to automate transaction categorization.
          </p>
          <Button asChild className="mt-4">
            <Link href="/banking/rules/new">Create Rule</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-center">Hits</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">{rule.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {rule.conditions.map((condition, idx) => (
                        <p key={idx} className="text-sm">
                          <span className="text-muted-foreground">
                            {getConditionFieldLabel(condition.field)}
                          </span>{' '}
                          <span className="font-medium">
                            {getConditionOperatorLabel(condition.operator)}
                          </span>{' '}
                          <span className="font-mono bg-muted px-1 rounded">
                            {condition.value}
                          </span>
                        </p>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getActionTypeLabel(rule.action.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-mono">{rule.hitCount}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className="inline-flex items-center"
                    >
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
                  </TableCell>
                  <TableCell>
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
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteId(rule.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
