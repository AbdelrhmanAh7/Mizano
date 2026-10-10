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
  getAccountTypeLabel,
} from '@/lib/hooks/use-accounts';
import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { useJournals, formatJournalAmount } from '@/lib/hooks/use-journals';
import { format } from 'date-fns';

export default function AccountDetailPage() {
  const money = useDocumentMoney();
  const params = useParams();
  const accountId = params.id as string;

  const { data: account, isLoading: accountLoading } = useAccount(accountId);
  const tc = useTranslations('common');
  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
  } = useAccountBalance(accountId);
  const { data: journalsData } = useJournals({ limit: 10, sortBy: 'date', sortOrder: 'desc' });

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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/accounting/accounts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Account Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The account you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/accounting/accounts">Back to Accounts</Link>
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
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/accounting/accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {account.code} - {account.name}
            </h1>
            <Badge className={getAccountTypeColor(account.type)}>
              {getAccountTypeLabel(account.type)}
            </Badge>
          </div>
          <p className="text-muted-foreground">{account.description || 'No description'}</p>
        </div>
      </div>

      {/* Account Info & Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Code</dt>
                <dd className="text-lg font-semibold">{account.code}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Type</dt>
                <dd>
                  <Badge className={getAccountTypeColor(account.type)}>
                    {getAccountTypeLabel(account.type)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Currency</dt>
                <dd className="text-lg">{account.currency}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={account.isActive ? 'default' : 'secondary'}>
                    {account.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </dd>
              </div>
              {account.parent && (
                <div className="col-span-2">
                  <dt className="text-sm font-medium text-muted-foreground">Parent Account</dt>
                  <dd className="text-lg">
                    {account.parent.code} - {account.parent.name}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                <dd>{format(new Date(account.createdAt), 'MMM d, yyyy')}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">System Account</dt>
                <dd>{account.isSystem ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balance Summary</CardTitle>
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
                  <p className="text-sm font-medium text-muted-foreground">Current Balance</p>
                  <p className="text-3xl font-bold">{money(balance.balance)}</p>
                </div>
                {balance.totalDebits !== undefined && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Debits</p>
                      <p className="text-lg font-mono">
                        {formatJournalAmount(balance.totalDebits)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Credits</p>
                      <p className="text-lg font-mono">
                        {formatJournalAmount(balance.totalCredits)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No balance data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Journal Lines */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {relevantJournals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No journal entries for this account.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Journal #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
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
                        <TableCell>{format(new Date(journal.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Link
                            href={`/accounting/journals/${journal.id}`}
                            className="font-medium hover:underline"
                          >
                            {journal.journalNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{line.description || journal.notes || '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {parseFloat(line.debit || '0') > 0
                            ? formatJournalAmount(line.debit)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
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
