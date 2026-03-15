'use client';

import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { useTranslations } from 'next-intl';
import { CalendarClock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UpcomingPayment, formatCurrency } from '@/lib/hooks/use-dashboard';
import { Link } from '@/i18n/routing';

interface UpcomingPaymentsProps {
  payments: UpcomingPayment[];
}

function getDueDateLabel(dueDate: string): { label: string; urgent: boolean } {
  const date = new Date(dueDate);
  if (isPast(date) && !isToday(date)) return { label: 'Overdue', urgent: true };
  if (isToday(date)) return { label: 'Due Today', urgent: true };
  if (isTomorrow(date)) return { label: 'Tomorrow', urgent: false };
  return { label: format(date, 'MMM d'), urgent: false };
}

export function UpcomingPayments({ payments }: UpcomingPaymentsProps) {
  const t = useTranslations('common.dashboard.upcomingPayments');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/purchases/bills">{t('viewAll')}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('noPayments')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map((payment) => {
              const due = getDueDateLabel(payment.dueDate);

              return (
                <div
                  key={payment.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className={cn('p-2 rounded-lg', due.urgent ? 'bg-red-100' : 'bg-amber-100')}>
                    <div className={due.urgent ? 'text-red-600' : 'text-amber-600'}>
                      {due.urgent ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={payment.link}
                        className="font-mono text-sm text-blue-600 hover:underline"
                      >
                        {payment.reference}
                      </Link>
                      <Badge
                        variant={due.urgent ? 'destructive' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {due.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{payment.vendorName}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="font-mono font-medium text-red-600">
                      {formatCurrency(payment.amount)}
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
