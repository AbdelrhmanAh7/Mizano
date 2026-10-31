import React from 'react';
import { render, screen } from '@testing-library/react';
import { CHART_AXIS, ChartCard } from './chart-card';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children, width, height }: Record<string, React.ReactNode>) => (
    <div data-testid="responsive" data-size={`${width}x${height}`}>
      {children}
    </div>
  ),
}));

describe('ChartCard (shared dashboard chart frame)', () => {
  it('renders the title and the chart inside a full-size responsive container', () => {
    render(
      <ChartCard title="Top vendors">
        <svg data-testid="chart" />
      </ChartCard>,
    );
    expect(screen.getByText('Top vendors')).toBeTruthy();
    const container = screen.getByTestId('responsive');
    expect(container.getAttribute('data-size')).toBe('100%x100%');
    expect(container.parentElement?.className).toBe('h-[300px]');
    expect(screen.getByTestId('chart')).toBeTruthy();
  });

  it('keeps the axis look the charts used before', () => {
    expect(CHART_AXIS).toEqual({
      axisLine: false,
      tickLine: false,
      tick: { fill: 'hsl(var(--muted-foreground))' },
    });
  });
});
