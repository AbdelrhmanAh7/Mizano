'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAccount,
  useAccountBalance,
  getAccountTypeColor,
  useAccountTypeLabel,
} from '@/lib/hooks/use-accounts';
import { moneyToNumber } from '@/lib/money';
import { useJournals, formatJournalAmount } from '@/lib/hooks/use-journals';
import { format } from 'date-fns';
import { useDateFnsLocale } from '@/lib/date-locale';

export default function AccountDetailPage() {
  const dateLocale = useDateFnsLocale();
  const typeLabel = useAccountTypeLabel();
  const params = useParams();
  const accountId = params.id as string;

  const { data: account, isLoading: accountLoading } = useAccount(accountId);
  const tc = useTranslations('common');
  const td = useTranslations('accounting.accounts.detail');
  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
  } = useAccountBalance(accountId);
  const { data: journalsData, isError: journalsError } = useJournals({
    limit: 10,
    sortBy: 'date',
    sortOrder: 'desc',
  });

  if (accountLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={td('goBack')}>
            <Link href="/accounting/accounts">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{td('notFoundTitle')}</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{td('notFoundDescription')}</p>
            <Button asChild className="mt-4">
              <Link href="/accounting/accounts">{td('backToAccounts')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter journal lines that reference this account
  const journals = journalsData?.data || [];
  const relevantJournals = journals.filter((j: { lines?: Array<{ accountId: string }> }) =>
    j.lines?.some((l) => l.accountId === accountId),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={td('goBack')}>
          <Link href="/accounting/accounts">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              <bdi>{account.code}</bdi> - {account.name}
            </h1>
            <Badge className={getAccountTypeColor(account.type)}>{typeLabel(account.type)}</Badge>
          </div>
          <p className="text-muted-foreground">{account.description || td('noDescription')}</p>
        </div>
      </div>

      {/* Account Info & Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{td('details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{td('code')}</dt>
                <dd className="text-lg font-semibold">{account.code}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{td('type')}</dt>
                <dd>
                  <Badge className={getAccountTypeColor(account.type)}>
                    {typeLabel(account.type)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{td('currency')}</dt>
                <dd className="text-lg">{account.currency}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{td('status')}</dt>
                <dd>
                  <Badge variant={account.isActive ? 'default' : 'secondary'}>
                    {account.isActive ? td('active') : td('inactive')}
                  </Badge>
                </dd>
              </div>
              {account.parent && (
                <div className="col-span-2">
                  <dt className="text-sm font-medium text-muted-foreground">{td('parent')}</dt>
                  <dd className="text-lg">
                    <bdi>{account.parent.code}</bdi> - {account.parent.name}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{td('created')}</dt>
                <dd>{format(new Date(account.createdAt), 'PP', { locale: dateLocale })}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{td('systemAccount')}</dt>
                <dd>{account.isSystem ? td('yes') : td('no')}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{td('balanceSummary')}</CardTitle>
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <Skeleton className="h-16 w-32" />
            ) : balanceError ? (
              <p className="text-muted-foreground" role="alert">
                {tc('table.error')}
              </p>
            ) : balance ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {td('currentBalance')}
                  </p>
                  <p className="text-3xl font-bold" dir="ltr">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: account.currency || 'USD',
                    }).format(moneyToNumber(balance.balance))}
                  </p>
                </div>
                {balance.totalDebits !== undefined && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {td('totalDebits')}
                      </p>
                      <p className="text-lg font-mono">
                        {formatJournalAmount(balance.totalDebits)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {td('totalCredits')}
                      </p>
                      <p className="text-lg font-mono">
                        {formatJournalAmount(balance.totalCredits)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{td('noBalance')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Journal Lines */}
      <Card>
        <CardHeader>
          <CardTitle>{td('recentJournals')}</CardTitle>
        </CardHeader>
        <CardContent>
          {journalsError ? (
            <p className="text-sm text-muted-foreground" role="alert">
              {td('journalsError')}
            </p>
          ) : relevantJournals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{td('noJournals')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{td('date')}</TableHead>
                  <TableHead>{td('journalNumber')}</TableHead>
                  <TableHead>{td('description')}</TableHead>
                  <TableHead className="text-end">{td('debit')}</TableHead>
                  <TableHead className="text-end">{td('credit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relevantJournals.map(
                  (journal: {
                    id: string;
                    journalNumber: string;
                    date: string;
                    notes: string | null;
                    lines?: Array<{
                      accountId: string;
                      debit: string;
                      credit: string;
                      description?: string;
                    }>;
                  }) => {
                    const line = journal.lines?.find((l) => l.accountId === accountId);
                    if (!line) return null;
                    return (
                      <TableRow key={journal.id}>
                        <TableCell>
                          {format(new Date(journal.date), 'PP', { locale: dateLocale })}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/accounting/journals/${journal.id}`}
                            className="font-medium hover:underline"
                          >
                            {journal.journalNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{line.description || journal.notes || '-'}</TableCell>
                        <TableCell className="text-end font-mono">
                          {parseFloat(line.debit || '0') > 0
                            ? formatJournalAmount(line.debit)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-end font-mono">
                          {parseFloat(line.credit || '0') > 0
                            ? formatJournalAmount(line.credit)
                            : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  },
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
