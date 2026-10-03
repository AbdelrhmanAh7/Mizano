import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatCard } from './stat-card';

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'fromLastMonth' && params?.value !== undefined) {
      return `${params.value}% from last month`;
    }
    return key;
  },
}));

// Mock lucide-react - provide a generic icon factory
jest.mock('lucide-react', () => {
  const mockIcon = React.forwardRef<SVGSVGElement, { className?: string }>(
    ({ className, ...props }, ref) => (
      <svg ref={ref} data-testid="stat-icon" className={className} {...props} />
    ),
  );
  mockIcon.displayName = 'MockIcon';
  return {
    DollarSign: mockIcon,
    Users: mockIcon,
    Package: mockIcon,
    TrendingUp: mockIcon,
  };
});

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: { children: React.ReactNode }) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Mock formatCompactCurrency
jest.mock('@/lib/hooks/use-dashboard', () => ({
  formatCompactCurrency: (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  },
}));

// Grab a reference to one of the mocked icons
const { DollarSign, Users } = jest.requireMock('lucide-react');

describe('StatCard', () => {
  it('renders the title text', () => {
    render(<StatCard title="Total Revenue" value={50000} icon={DollarSign} currency="EGP" />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('renders a formatted currency value by default', () => {
    render(<StatCard title="Revenue" value={1500000} icon={DollarSign} currency="USD" />);
    // Compact notation: $1.5M
    expect(screen.getByText('$1.5M')).toBeInTheDocument();
  });

  it.each(['EGP', 'SAR', 'AED'])('shows no dollar sign for a %s organization', (code) => {
    const { container } = render(
      <StatCard title="Revenue" value={1500000} icon={DollarSign} currency={code} />,
    );
    expect(container.textContent).not.toContain('$');
    expect(container.textContent).not.toContain('USD');
  });

  it('renders a plain number when currency is "count"', () => {
    render(<StatCard title="Active Users" value={1234} icon={Users} currency="count" />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders the icon', () => {
    render(<StatCard title="Revenue" value={50000} icon={DollarSign} currency="EGP" />);
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('renders a positive trend with green color and up arrow', () => {
    render(
      <StatCard
        title="Revenue"
        value={50000}
        icon={DollarSign}
        currency="EGP"
        trend={{ value: 12.5, isPositive: true }}
      />,
    );
    const trendElement = screen.getByText((content) => content.includes('12.5% from last month'));
    expect(trendElement).toBeInTheDocument();
    expect(trendElement.className).toContain('text-green-600');
    expect(trendElement.textContent).toContain('\u2191'); // up arrow
  });

  it('renders a negative trend with red color and down arrow', () => {
    render(
      <StatCard
        title="Revenue"
        value={50000}
        icon={DollarSign}
        currency="EGP"
        trend={{ value: -8.3, isPositive: false }}
      />,
    );
    const trendElement = screen.getByText((content) => content.includes('8.3% from last month'));
    expect(trendElement).toBeInTheDocument();
    expect(trendElement.className).toContain('text-red-600');
    expect(trendElement.textContent).toContain('\u2193'); // down arrow
  });

  it('does not render trend section when trend prop is not provided', () => {
    render(<StatCard title="Revenue" value={50000} icon={DollarSign} currency="EGP" />);
    expect(screen.queryByText(/from last month/)).not.toBeInTheDocument();
  });

  it('applies custom icon color and background color', () => {
    const { container } = render(
      <StatCard
        title="Revenue"
        value={50000}
        icon={DollarSign}
        currency="EGP"
        iconColor="text-purple-600"
        iconBgColor="bg-purple-100"
      />,
    );
    // Icon colors are applied via cn() to wrapper divs
    expect(container.innerHTML).toContain('text-purple-600');
    expect(container.innerHTML).toContain('bg-purple-100');
  });

  it('defaults to blue icon color and background when not specified', () => {
    const { container } = render(
      <StatCard title="Revenue" value={50000} icon={DollarSign} currency="EGP" />,
    );
    // Default blue colors should be in the rendered HTML
    expect(container.innerHTML).toContain('blue');
  });
});
