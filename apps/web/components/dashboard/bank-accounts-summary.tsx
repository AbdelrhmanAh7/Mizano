'use client';

import { useTranslations } from 'next-intl';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BankAccountSummary, formatCurrency } from '@/lib/hooks/use-dashboard';
import { Link } from '@/i18n/routing';

interface BankAccountsSummaryProps {
  accounts: BankAccountSummary[];
}

export function BankAccountsSummary({ accounts }: BankAccountsSummaryProps) {
  const t = useTranslations('common.dashboard.bankAccounts');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/banking/accounts">{t('viewAll')}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('noAccounts')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const diff = account.systemBalance - account.bankBalance;
              const hasDiscrepancy = Math.abs(diff) > 0.01;

              return (
                <div
                  key={account.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-blue-100">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{account.name}</p>
                    <p className="text-xs text-muted-foreground">{account.currency}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="font-mono font-medium text-sm">
                      {formatCurrency(account.systemBalance, account.currency)}
                    </p>
                    {hasDiscrepancy && (
                      <p
                        className={cn(
                          'text-[10px] font-mono',
                          diff > 0 ? 'text-amber-600' : 'text-amber-600',
                        )}
                      >
                        {t('bankDiff')}: {diff > 0 ? '+' : ''}
                        {formatCurrency(diff, account.currency)}
                      </p>
                    )}
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
