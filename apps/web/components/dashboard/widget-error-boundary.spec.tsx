import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

jest.mock('lucide-react', () => ({
  AlertCircle: ({ className }: { className?: string }) => (
    <span data-testid="icon-alert" className={className} />
  ),
  RotateCcw: ({ className }: { className?: string }) => (
    <span data-testid="icon-retry" className={className} />
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { WidgetErrorBoundary } from './widget-error-boundary';

function ThrowingWidget({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Cannot read properties of undefined (reading 'call')");
  }
  return <div>Widget content</div>;
}

function ThrowingChartWidget(): React.ReactNode {
  throw new Error('options.factory is not a function');
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('WidgetErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <WidgetErrorBoundary widgetId="bank-inventory">
        <div>Chart loaded</div>
      </WidgetErrorBoundary>,
    );
    expect(screen.getByText('Chart loaded')).toBeInTheDocument();
  });

  it('catches webpack factory error and shows fallback UI', () => {
    render(
      <WidgetErrorBoundary widgetId="bank-inventory">
        <ThrowingWidget shouldThrow />
      </WidgetErrorBoundary>,
    );
    expect(screen.getByText(/Failed to load widget/)).toBeInTheDocument();
    expect(screen.getByText(/bank-inventory/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('catches chart component errors and shows fallback', () => {
    render(
      <WidgetErrorBoundary widgetId="cash-flow-revenue">
        <ThrowingChartWidget />
      </WidgetErrorBoundary>,
    );
    expect(screen.getByText(/Failed to load widget/)).toBeInTheDocument();
    expect(screen.getByText(/cash-flow-revenue/)).toBeInTheDocument();
  });

  it('displays widget ID when provided', () => {
    render(
      <WidgetErrorBoundary widgetId="profit-customers">
        <ThrowingWidget shouldThrow />
      </WidgetErrorBoundary>,
    );
    expect(screen.getByText(/profit-customers/)).toBeInTheDocument();
  });

  it('handles missing widget ID gracefully', () => {
    render(
      <WidgetErrorBoundary>
        <ThrowingWidget shouldThrow />
      </WidgetErrorBoundary>,
    );
    expect(screen.getByText('Failed to load widget.')).toBeInTheDocument();
  });

  it('logs error details with widget ID to console', () => {
    render(
      <WidgetErrorBoundary widgetId="ar-ap-expenses">
        <ThrowingWidget shouldThrow />
      </WidgetErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('ar-ap-expenses'),
      expect.any(String),
      expect.any(String),
    );
  });

  it('recovers after retry when error is resolved', () => {
    let shouldThrow = true;

    function ConditionalChart() {
      if (shouldThrow) throw new Error('webpack chunk error');
      return <div>Chart recovered</div>;
    }

    render(
      <WidgetErrorBoundary widgetId="ai-forecast">
        <ConditionalChart />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText(/Failed to load widget/)).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));

    expect(screen.getByText('Chart recovered')).toBeInTheDocument();
  });

  it('shows error again if retry still fails', () => {
    render(
      <WidgetErrorBoundary widgetId="bank-inventory">
        <ThrowingWidget shouldThrow />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText(/Failed to load widget/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByText(/Failed to load widget/)).toBeInTheDocument();
  });

  it('renders destructive border styling on error', () => {
    render(
      <WidgetErrorBoundary widgetId="bank-inventory">
        <ThrowingWidget shouldThrow />
      </WidgetErrorBoundary>,
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('border-destructive');
  });

  it('isolates errors — sibling widgets still render', () => {
    render(
      <div>
        <WidgetErrorBoundary widgetId="broken">
          <ThrowingWidget shouldThrow />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary widgetId="working">
          <ThrowingWidget shouldThrow={false} />
        </WidgetErrorBoundary>
      </div>,
    );
    expect(screen.getByText(/Failed to load widget/)).toBeInTheDocument();
    expect(screen.getByText('Widget content')).toBeInTheDocument();
  });
});
