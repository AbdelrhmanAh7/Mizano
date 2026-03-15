'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LeadSourceItem } from '@/lib/hooks/use-dashboard-sections';

interface LeadsBySourceChartProps {
  data: LeadSourceItem[];
}

const SOURCE_COLORS: Record<string, string> = {
  WEBSITE: '#3b82f6',
  FACEBOOK_ADS: '#8b5cf6',
  GOOGLE_ADS: '#22c55e',
  REFERRAL: '#f59e0b',
  COLD_CALL: '#ef4444',
  OTHER: '#94a3b8',
};

export const LeadsBySourceChart = memo(function LeadsBySourceChart({
  data,
}: LeadsBySourceChartProps) {
  const t = useTranslations('common.dashboard.charts');

  const SOURCE_LABELS: Record<string, string> = {
    WEBSITE: t('website'),
    FACEBOOK_ADS: t('facebookAds'),
    GOOGLE_ADS: t('googleAds'),
    REFERRAL: t('referral'),
    COLD_CALL: t('coldCall'),
    OTHER: t('other'),
  };

  const chartData = data.map((item) => ({
    ...item,
    label: SOURCE_LABELS[item.source] ?? item.source,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('leadsBySource')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="count"
                nameKey="label"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={SOURCE_COLORS[entry.source] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
