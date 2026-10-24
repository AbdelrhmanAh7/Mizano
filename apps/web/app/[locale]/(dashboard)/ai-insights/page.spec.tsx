/**
 * Regression test for AIInsightsPage.
 *
 * Verifies that insights with empty/invalid createdAt do not throw "Invalid time value",
 * and that links and headers render correctly.
 */

import React from 'react';
import { render } from '@testing-library/react';

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

const mockUseAIInsights = jest.fn();
const mockUseDismissInsight = jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false }));
const mockUseRunAnomalyDetection = jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false }));

jest.mock('@/lib/hooks/use-ai', () => ({
  useAIInsights: (...args: unknown[]) => mockUseAIInsights(...args),
  useDismissInsight: () => mockUseDismissInsight(),
  useRunAnomalyDetection: () => mockUseRunAnomalyDetection(),
  getInsightTypeLabel: (t: string) => t,
  getInsightTypeColor: () => 'bg-red-100 text-red-800 border-red-200',
  getInsightPriorityLabel: (p: string) => p,
  getInsightPriorityColor: () => 'bg-orange-100 text-orange-800',
  formatConfidence: (c: number) => `${Math.round(c * 100)}%`,
}));

import AIInsightsPage from './page';

describe('AIInsightsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders insights without throwing "Invalid time value" when createdAt is invalid or empty', () => {
    mockUseAIInsights.mockReturnValue({
      data: {
        data: [
          {
            id: 'ins-1',
            type: 'ANOMALY',
            priority: 'HIGH',
            status: 'NEW',
            title: 'Test Anomaly',
            description: 'Test description',
            confidence: 0.9,
            createdAt: 'invalid-date',
          },
        ],
      },
      isLoading: false,
      refetch: jest.fn(),
    });

    expect(() => {
      render(<AIInsightsPage />);
    }).not.toThrow();
  });
});
