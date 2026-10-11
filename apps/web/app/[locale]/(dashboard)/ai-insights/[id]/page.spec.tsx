/**
 * Regression tests for InsightDetailPage.
 *
 * Error 1-3: "Invalid time value"
 *   Root cause: useAIInsight returns { data: { data: insightObj } } from React Query.
 *   The page destructured as { data: insight } giving insight = { data: insightObj }.
 *   Accessing insight.createdAt returned undefined, and new Date(undefined) produces
 *   an Invalid Date, causing date-fns format() to throw "Invalid time value".
 *   Fix: unwrap the API envelope with insightResponse?.data to get the actual insight.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseAIInsight = jest.fn();
const mockUseDismissInsight = jest.fn(() => ({ mutateAsync: jest.fn() }));
const mockUseActionInsight = jest.fn(() => ({ mutateAsync: jest.fn() }));

jest.mock('@/lib/hooks/use-ai', () => ({
  useAIInsight: (...args: unknown[]) => mockUseAIInsight(...args),
  useDismissInsight: () => mockUseDismissInsight(),
  useActionInsight: () => mockUseActionInsight(),
  getInsightTypeLabel: (t: string) => t,
  getInsightTypeColor: () => 'bg-red-100 text-red-800 border-red-200',
  getInsightPriorityLabel: (p: string) => p,
  getInsightPriorityColor: () => 'bg-orange-100 text-orange-800',
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import InsightDetailPage from './page';

// ── Test data ─────────────────────────────────────────────────────────────────

const mockInsight = {
  id: 'ins-1',
  type: 'ANOMALY',
  priority: 'HIGH',
  status: 'NEW',
  title: 'Unusual spending detected',
  description: 'Spending in Q1 exceeded forecast by 35%.',
  impact: 'May affect cash reserves',
  recommendation: 'Review discretionary expenses',
  data: null,
  module: 'accounting',
  entityType: 'expense',
  entityId: 'exp-123',
  confidence: 0.92,
  createdAt: '2026-03-15T10:30:00.000Z',
  expiresAt: '2026-04-15T10:30:00.000Z',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InsightDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders insight details without "Invalid time value" when API returns envelope', () => {
    // The API returns { data: insight } — simulating the real envelope
    mockUseAIInsight.mockReturnValue({
      data: { data: mockInsight },
      isLoading: false,
    });

    expect(() => {
      render(<InsightDetailPage params={{ id: 'ins-1' }} />);
    }).not.toThrow();

    expect(screen.getByText('Unusual spending detected')).toBeInTheDocument();
    expect(screen.getByText('Spending in Q1 exceeded forecast by 35%.')).toBeInTheDocument();
  });

  it('shows not-found state when insight is missing from envelope', () => {
    mockUseAIInsight.mockReturnValue({
      data: { data: null },
      isLoading: false,
    });

    render(<InsightDetailPage params={{ id: 'nonexistent' }} />);

    expect(screen.getByText('notFound')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    mockUseAIInsight.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<InsightDetailPage params={{ id: 'ins-1' }} />);

    // When loading, the insight title should NOT be visible
    expect(screen.queryByText('Unusual spending detected')).not.toBeInTheDocument();
    // And the not-found message should also NOT appear
    expect(screen.queryByText('notFound')).not.toBeInTheDocument();
  });

  it('renders expiresAt date without error', () => {
    mockUseAIInsight.mockReturnValue({
      data: { data: mockInsight },
      isLoading: false,
    });

    expect(() => {
      render(<InsightDetailPage params={{ id: 'ins-1' }} />);
    }).not.toThrow();

    // The expires section should render (the translation key)
    expect(screen.getByText('expires')).toBeInTheDocument();
  });

  it('handles insight without optional expiresAt', () => {
    const insightNoExpiry = { ...mockInsight, expiresAt: undefined };
    mockUseAIInsight.mockReturnValue({
      data: { data: insightNoExpiry },
      isLoading: false,
    });

    expect(() => {
      render(<InsightDetailPage params={{ id: 'ins-1' }} />);
    }).not.toThrow();

    expect(screen.queryByText('expires')).not.toBeInTheDocument();
  });
});
