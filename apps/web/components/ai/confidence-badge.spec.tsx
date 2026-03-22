import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConfidenceBadge, ConfidenceBar, ConfidenceIndicator } from './confidence-badge';

// Mock lucide-react icons to simple spans
jest.mock('lucide-react', () => ({
  Sparkles: ({ className }: { className?: string }) => (
    <span data-testid="icon-sparkles" className={className} />
  ),
  CircleDot: ({ className }: { className?: string }) => (
    <span data-testid="icon-circle-dot" className={className} />
  ),
  CircleAlert: ({ className }: { className?: string }) => (
    <span data-testid="icon-circle-alert" className={className} />
  ),
}));

// Mock Radix Tooltip to just render children
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: React.forwardRef<HTMLElement, { children: React.ReactNode; asChild?: boolean }>(
    ({ children }, ref) => <div ref={ref as React.Ref<HTMLDivElement>}>{children}</div>,
  ),
}));

// Mock the Badge component
jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    className,
    variant,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
  }) => (
    <div data-testid="badge" data-variant={variant} className={className} {...props}>
      {children}
    </div>
  ),
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

describe('ConfidenceBadge', () => {
  it('renders "High" label for confidence >= 0.85', () => {
    render(<ConfidenceBadge confidence={0.92} showTooltip={false} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders "Medium" label for confidence >= 0.6 and < 0.85', () => {
    render(<ConfidenceBadge confidence={0.7} showTooltip={false} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('renders "Low" label for confidence < 0.6', () => {
    render(<ConfidenceBadge confidence={0.3} showTooltip={false} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('shows percentage text when showPercentage is true', () => {
    render(<ConfidenceBadge confidence={0.92} showTooltip={false} showPercentage={true} />);
    expect(screen.getByText('(92%)')).toBeInTheDocument();
  });

  it('hides percentage text when showPercentage is false', () => {
    render(<ConfidenceBadge confidence={0.92} showTooltip={false} showPercentage={false} />);
    expect(screen.queryByText('(92%)')).not.toBeInTheDocument();
  });

  it('applies green color classes for high confidence', () => {
    render(<ConfidenceBadge confidence={0.95} showTooltip={false} />);
    const badge = screen.getByTestId('badge');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('applies yellow color classes for medium confidence', () => {
    render(<ConfidenceBadge confidence={0.65} showTooltip={false} />);
    const badge = screen.getByTestId('badge');
    expect(badge.className).toContain('bg-yellow-100');
    expect(badge.className).toContain('text-yellow-800');
  });

  it('applies red color classes for low confidence', () => {
    render(<ConfidenceBadge confidence={0.2} showTooltip={false} />);
    const badge = screen.getByTestId('badge');
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });

  it('renders the Sparkles icon for high confidence', () => {
    render(<ConfidenceBadge confidence={0.9} showTooltip={false} />);
    expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument();
  });

  it('renders the CircleDot icon for medium confidence', () => {
    render(<ConfidenceBadge confidence={0.7} showTooltip={false} />);
    expect(screen.getByTestId('icon-circle-dot')).toBeInTheDocument();
  });

  it('renders the CircleAlert icon for low confidence', () => {
    render(<ConfidenceBadge confidence={0.4} showTooltip={false} />);
    expect(screen.getByTestId('icon-circle-alert')).toBeInTheDocument();
  });

  it('handles 0% confidence as Low', () => {
    render(<ConfidenceBadge confidence={0} showTooltip={false} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('(0%)')).toBeInTheDocument();
  });

  it('handles 100% confidence as High', () => {
    render(<ConfidenceBadge confidence={1} showTooltip={false} />);
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('(100%)')).toBeInTheDocument();
  });

  it('handles boundary value 0.85 as High', () => {
    render(<ConfidenceBadge confidence={0.85} showTooltip={false} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('handles boundary value 0.6 as Medium', () => {
    render(<ConfidenceBadge confidence={0.6} showTooltip={false} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('handles boundary value 0.5999 as Low', () => {
    render(<ConfidenceBadge confidence={0.5999} showTooltip={false} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders tooltip content when showTooltip is true', () => {
    render(<ConfidenceBadge confidence={0.9} showTooltip={true} />);
    expect(screen.getByText('High Confidence')).toBeInTheDocument();
    expect(screen.getByText('AI is highly confident in this suggestion')).toBeInTheDocument();
  });

  it('does not render tooltip content when showTooltip is false', () => {
    render(<ConfidenceBadge confidence={0.9} showTooltip={false} />);
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
  });
});

describe('ConfidenceBar', () => {
  it('renders the bar with correct width for given confidence', () => {
    const { container } = render(<ConfidenceBar confidence={0.75} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '75%' });
  });

  it('applies green color for high confidence', () => {
    const { container } = render(<ConfidenceBar confidence={0.9} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar?.className).toContain('bg-green-500');
  });

  it('applies yellow color for medium confidence', () => {
    const { container } = render(<ConfidenceBar confidence={0.7} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar?.className).toContain('bg-yellow-500');
  });

  it('applies red color for low confidence', () => {
    const { container } = render(<ConfidenceBar confidence={0.3} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar?.className).toContain('bg-red-500');
  });

  it('renders labels when showLabels is true', () => {
    render(<ConfidenceBar confidence={0.5} showLabels={true} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('does not render labels when showLabels is false', () => {
    render(<ConfidenceBar confidence={0.5} showLabels={false} />);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});

describe('ConfidenceIndicator', () => {
  it('renders the correct icon for high confidence', () => {
    render(<ConfidenceIndicator confidence={0.9} />);
    expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument();
  });

  it('renders the correct icon for medium confidence', () => {
    render(<ConfidenceIndicator confidence={0.7} />);
    expect(screen.getByTestId('icon-circle-dot')).toBeInTheDocument();
  });

  it('renders the correct icon for low confidence', () => {
    render(<ConfidenceIndicator confidence={0.3} />);
    expect(screen.getByTestId('icon-circle-alert')).toBeInTheDocument();
  });
});
