'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerStatement, Customer } from '@/lib/hooks/use-customers';
import { moneyToNumber } from '@/lib/money';
import { cn } from '@/lib/utils';

interface CustomerStatementProps {
  customerId: string;
  customer?: Customer;
}

/** Detail pages of the documents a statement row comes from. */
const SOURCE_ROUTES: Record<'invoice' | 'payment' | 'creditNote', (id: string) => string> = {
  invoice: (id) => `/sales/invoices/${id}`,
  payment: (id) => `/sales/payments/${id}`,
  creditNote: (id) => `/sales/credit-notes/${id}`,
};

/** Shows a fixed-scale decimal string as currency, or a dash for zero (display only). */
function showAmount(value: string, format: (amount: number) => string): string {
  const n = moneyToNumber(value);
  return n === 0 ? '-' : format(n);
}

function balanceClass(value: string): string {
  const n = moneyToNumber(value);
  return n > 0 ? 'text-red-600' : n < 0 ? 'text-green-600' : '';
}

export function CustomerStatement({ customerId }: CustomerStatementProps) {
  const t = useTranslations('sales.customers.statement');
  const tc = useTranslations('common');
  const { data: statement, isLoading, isError, refetch } = useCustomerStatement(customerId);

  const money = useDocumentMoney();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !statement) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4" role="alert">
          <p className="text-muted-foreground">{tc('table.error')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {tc('dashboard.tryAgain')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Every figure below was computed by the API in exact Decimal; the UI only formats it.
  const hasTransactions = statement.transactions.length > 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t('totalInvoiced')}</div>
            <div className="text-2xl font-bold font-mono text-blue-600">
              {money(moneyToNumber(statement.totalInvoiced))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t('totalPaid')}</div>
            <div className="text-2xl font-bold font-mono text-green-600">
              {money(moneyToNumber(statement.totalCredits))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t('outstanding')}</div>
            <div
              className={cn('text-2xl font-bold font-mono', balanceClass(statement.closingBalance))}
            >
              {money(moneyToNumber(statement.closingBalance))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statement Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasTransactions ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{t('noTransactions')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.date')}</TableHead>
                  <TableHead>{t('columns.type')}</TableHead>
                  <TableHead>{t('columns.reference')}</TableHead>
                  <TableHead className="text-right">{t('columns.debit')}</TableHead>
                  <TableHead className="text-right">{t('columns.credit')}</TableHead>
                  <TableHead className="text-right">{t('columns.balance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moneyToNumber(statement.openingBalance) !== 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">
                      {t('openingBalance')}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(moneyToNumber(statement.openingBalance))}
                    </TableCell>
                  </TableRow>
                )}
                {statement.transactions.map((line, index) => (
                  <TableRow key={`${line.type}-${line.reference}-${index}`}>
                    <TableCell>{format(new Date(line.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          line.type === 'Invoice' && 'bg-blue-100 text-blue-800',
                          line.type === 'Payment' && 'bg-green-100 text-green-800',
                          (line.type === 'Payment Void' || line.type === 'Invoice Void') &&
                            'bg-red-100 text-red-800',
                          (line.type === 'Credit Note' || line.type === 'Credit Note Refund') &&
                            'bg-yellow-100 text-yellow-800',
                        )}
                      >
                        {t(`types.${line.type}`)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={SOURCE_ROUTES[line.sourceType](line.sourceId)}
                        className="text-blue-600 hover:underline"
                      >
                        {line.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {showAmount(line.debit, money)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {showAmount(line.credit, money)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(moneyToNumber(line.balance))}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Closing Balance Row */}
                <TableRow className="border-t-2 bg-muted/50">
                  <TableCell colSpan={3} className="font-semibold">
                    {t('balanceDue')}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {money(moneyToNumber(statement.totalDebits))}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {money(moneyToNumber(statement.totalCredits))}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono font-bold',
                      balanceClass(statement.closingBalance),
                    )}
                  >
                    {money(moneyToNumber(statement.closingBalance))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
