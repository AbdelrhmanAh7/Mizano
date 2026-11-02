'use client';

import { memo } from 'react';
import { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  iconColor?: string;
  iconBgColor?: string;
  currency?: string;
}

export const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  iconColor = 'text-primary',
  iconBgColor = 'bg-primary/10',
  currency,
}: StatCardProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard');
  // Counts in the page language with Western digits, like amounts (not the browser's locale,
  // which gave Arabic-Indic "٠" on Arabic systems).
  const locale = useLocale();
  const formatCount = (n: number) =>
    new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-US').format(n);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold font-mono mt-1">
              {currency === 'count' ? formatCount(value) : formatCompactCurrency(value, currency)}
            </p>
            {trend && (
              <p
                className={cn(
                  'text-xs mt-1',
                  trend.isPositive ? 'text-success' : 'text-destructive',
                )}
              >
                {trend.isPositive ? '↑' : '↓'}{' '}
                {t('fromLastMonth', { value: Math.abs(trend.value) })}
              </p>
            )}
          </div>
          <div className={cn('p-3 rounded-xl', iconBgColor)}>
            <Icon className={cn('h-6 w-6', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
