'use client';

import type { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Axis look shared by the dashboard charts: no axis line or ticks, muted labels. */
export const CHART_AXIS: {
  axisLine: false;
  tickLine: false;
  tick: { fill: string };
} = {
  axisLine: false,
  tickLine: false,
  tick: { fill: 'hsl(var(--muted-foreground))' },
};

/** Tooltip box that follows the card theme in light and dark mode. */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
};

/** A dashboard chart card: title and a responsive chart area of fixed height. */
export function ChartCard({
  title,
  children,
}: {
  title: string;
  /** One recharts chart (ResponsiveContainer takes a single child). */
  children: ReactElement;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
