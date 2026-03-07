'use client';

import { use } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Trash2, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useExpense, useDeleteExpense, formatCurrency } from '@/lib/hooks/use-expenses';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface ExpenseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ExpenseDetailPage({ params }: ExpenseDetailPageProps) {
  const { id } = use(params);
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const { data: expense, isLoading } = useExpense(id);
  const deleteExpense = useDeleteExpense();

  const canDelete = hasPermission('purchases.delete');

  const handleDelete = async () => {
    try {
      await deleteExpense.mutateAsync(id);
      router.push('/purchases/expenses');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('expenses.expenseNotFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/expenses">{t('expenses.backToExpenses')}</Link>
        </Button>
      </div>
    );
  }

  const amount = parseFloat(expense.amount);
  const taxAmount = parseFloat(expense.taxAmount || '0');
  const total = expense.taxInclusive ? amount : amount + taxAmount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/purchases/expenses">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('expenses.expenseDetails')}</h1>
            <p className="text-muted-foreground">
              {format(new Date(expense.date), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('expenses.deleteExpense')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('expenses.deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('expenses.deleteConfirmation')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  {tCommon('buttons.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('expenses.form.amount')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{formatCurrency(amount)}</div>
            {taxAmount > 0 && (
              <p className="text-sm text-muted-foreground">+ {formatCurrency(taxAmount)} tax</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('expenses.total')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-red-600">{formatCurrency(total)}</div>
            {expense.taxInclusive && taxAmount > 0 && (
              <p className="text-sm text-muted-foreground">{t('expenses.taxInclusive')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('expenses.category')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="text-base">
              {expense.account?.name || t('expenses.uncategorized')}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('expenses.details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('expenses.form.date')}</p>
              <p className="mt-1">{format(new Date(expense.date), 'MMMM d, yyyy')}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t('expenses.form.reference')}
              </p>
              <p className="mt-1 font-mono">{expense.reference || '-'}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t('expenses.form.vendor')}
              </p>
              <p className="mt-1">
                {expense.vendor ? (
                  <Link
                    href={`/purchases/vendors/${expense.vendor.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {expense.vendor.name}
                  </Link>
                ) : (
                  '-'
                )}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t('expenses.paidThrough')}
              </p>
              <p className="mt-1">{expense.paidThroughAccount?.name || '-'}</p>
            </div>

            {expense.project && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('expenses.project')}</p>
                <p className="mt-1">
                  <Link
                    href={`/projects/${expense.project.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {expense.project.name}
                  </Link>
                </p>
              </div>
            )}
          </div>

          {expense.description && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('expenses.form.description')}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{expense.description}</p>
              </div>
            </>
          )}

          {expense.receiptUrl && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('expenses.receipt')}</p>
                <div className="mt-2">
                  <Button variant="outline" asChild>
                    <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer">
                      <Receipt className="mr-2 h-4 w-4" />
                      {t('expenses.viewReceipt')}
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
