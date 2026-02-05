'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  FileText,
  CreditCard,
  Receipt,
  Banknote,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RecentTransaction, formatCurrency } from '@/lib/hooks/use-dashboard';

interface RecentTransactionsProps {
  transactions: RecentTransaction[];
}

function TransactionIcon({ type }: { type: RecentTransaction['type'] }) {
  switch (type) {
    case 'INVOICE':
      return <FileText className="h-4 w-4" />;
    case 'PAYMENT_RECEIVED':
      return <CreditCard className="h-4 w-4" />;
    case 'BILL':
      return <Receipt className="h-4 w-4" />;
    case 'PAYMENT_MADE':
      return <Banknote className="h-4 w-4" />;
    case 'EXPENSE':
      return <ShoppingCart className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getTransactionColors(type: RecentTransaction['type']) {
  switch (type) {
    case 'INVOICE':
      return { bg: 'bg-blue-100', icon: 'text-blue-600' };
    case 'PAYMENT_RECEIVED':
      return { bg: 'bg-green-100', icon: 'text-green-600' };
    case 'BILL':
      return { bg: 'bg-orange-100', icon: 'text-orange-600' };
    case 'PAYMENT_MADE':
      return { bg: 'bg-purple-100', icon: 'text-purple-600' };
    case 'EXPENSE':
      return { bg: 'bg-red-100', icon: 'text-red-600' };
    default:
      return { bg: 'bg-gray-100', icon: 'text-gray-600' };
  }
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Recent Transactions</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/accounting/journals">View All</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No recent transactions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction) => {
              const colors = getTransactionColors(transaction.type);
              const isPositive = transaction.amount > 0;

              return (
                <div
                  key={transaction.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className={cn('p-2 rounded-lg', colors.bg)}>
                    <div className={colors.icon}>
                      <TransactionIcon type={transaction.type} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={transaction.link}
                        className="font-mono text-sm text-blue-600 hover:underline"
                      >
                        {transaction.reference}
                      </Link>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {transaction.description}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={cn(
                        'flex items-center gap-1 font-mono font-medium',
                        isPositive ? 'text-green-600' : 'text-red-600'
                      )}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                      {formatCurrency(Math.abs(transaction.amount))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(transaction.date), 'MMM d')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
