'use client';

import { Suspense, useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApReconciliation } from '@/lib/hooks/use-reports';

function APReconciliationContent() {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const searchParams = useSearchParams();

  const queryAsOf = searchParams.get('asOf');
  const [asOfDate, setAsOfDate] = useState<string>(queryAsOf || format(new Date(), 'yyyy-MM-dd'));

  const { data: report, isLoading, isError, refetch } = useApReconciliation(asOfDate);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4" role="alert">
          <p className="text-muted-foreground">{tc('table.error')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {tc('dashboard.tryAgain')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isReconciled = report?.ok ?? true;
  const currency = report?.currencyCode ?? 'SAR';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{t('apReconciliation.title')}</h1>
              <Badge variant="outline" className="text-xs font-semibold">
                {t('apReconciliation.check')}
              </Badge>
            </div>
            <p className="text-muted-foreground">{t('apReconciliation.description')}</p>
          </div>
        </div>

        {/* Date Filter & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="asOfInput" className="text-sm font-medium whitespace-nowrap">
              {t('apReconciliation.asOfDate')}:
            </Label>
            <Input
              id="asOfInput"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void refetch()}
            title={t('actions.refresh')}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Reconciliation Status Card */}
      <Card
        className={isReconciled ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isReconciled ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <CardTitle className="text-lg">
                {isReconciled ? t('apReconciliation.reconciled') : t('apReconciliation.unbalanced')}
              </CardTitle>
            </div>
            <Badge variant={isReconciled ? 'default' : 'destructive'}>
              {isReconciled
                ? `${t('apReconciliation.difference')}: 0.0000`
                : `${t('apReconciliation.difference')}: ${report?.difference}`}
            </Badge>
          </div>
          <CardDescription>
            {isReconciled
              ? 'The AP subledger matches the posted AP control account lines exactly.'
              : 'There is a variance between the AP subledger and the AP control account lines.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('apReconciliation.subledgerTotal')}</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {report?.subledgerTotal ?? '0.0000'}{' '}
              <span className="text-sm font-normal text-muted-foreground">{currency}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Open balances of posted bills</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('apReconciliation.controlBalance')}</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {report?.controlBalance ?? '0.0000'}{' '}
              <span className="text-sm font-normal text-muted-foreground">{currency}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Posted journal lines on AP accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('apReconciliation.difference')}</CardDescription>
            <CardTitle
              className={`text-2xl font-bold ${isReconciled ? 'text-green-600' : 'text-red-600'}`}
            >
              {report?.difference ?? '0.0000'}{' '}
              <span className="text-sm font-normal text-muted-foreground">{currency}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Subledger − Control balance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('apReconciliation.currency')}</CardDescription>
            <CardTitle className="text-2xl font-bold">{currency}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Organization base currency</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function APReconciliationPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96" />
        </div>
      }
    >
      <APReconciliationContent />
    </Suspense>
  );
}
