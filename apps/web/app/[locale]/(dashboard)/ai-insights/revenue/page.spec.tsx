/**
 * Regression test for RevenueForecastPage.
 *
 * Verifies that dates returned in ISO format (e.g. "2026-10-01") do not cause
 * date-fns to throw RangeError: Invalid time value when rendered.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

jest.mock('@/i18n/routing', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return { Link };
});

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const mockUseRevenueForecast = jest.fn();

jest.mock('@/lib/hooks/use-ai', () => ({
  useRevenueForecast: (...args: unknown[]) => mockUseRevenueForecast(...args),
  formatCurrency: (val: number) => `$${val.toLocaleString()}`,
}));

import RevenueForecastPage from './page';

describe('RevenueForecastPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders monthly forecast without "Invalid time value" error when date is YYYY-MM-DD', () => {
    mockUseRevenueForecast.mockReturnValue({
      data: {
        data: [
          {
            date: '2026-10-01',
            isHistorical: true,
            actualRevenue: 45000,
            predictedRevenue: 45000,
          },
          {
            date: '2026-11-01',
            isHistorical: false,
            predictedRevenue: 52000,
          },
        ],
      },
      isLoading: false,
    });

    expect(() => {
      render(<RevenueForecastPage />);
    }).not.toThrow();

    expect(screen.getByText('title')).toBeInTheDocument();
  });

  it('renders monthly forecast when date is YYYY-MM format', () => {
    mockUseRevenueForecast.mockReturnValue({
      data: {
        data: [
          {
            date: '2026-11',
            isHistorical: false,
            predictedRevenue: 52000,
          },
        ],
      },
      isLoading: false,
    });

    expect(() => {
      render(<RevenueForecastPage />);
    }).not.toThrow();
  });
});
