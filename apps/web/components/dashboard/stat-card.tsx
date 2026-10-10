'use client';

import { memo } from 'react';
import { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

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
  currency: string;
}

export const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  iconColor = 'text-blue-600',
  iconBgColor = 'bg-blue-100',
  currency,
}: StatCardProps) {
  const t = useTranslations('common.dashboard');

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold font-mono mt-1">
              {currency === 'count'
                ? value.toLocaleString()
                : formatCompactCurrency(value, currency)}
            </p>
            {trend && (
              <p
                className={cn('text-xs mt-1', trend.isPositive ? 'text-green-600' : 'text-red-600')}
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
