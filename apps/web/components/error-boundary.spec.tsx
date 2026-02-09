/**
 * Tests for ErrorBoundary component.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  AlertCircle: ({ className }: { className?: string }) => (
    <span data-testid="icon-alert" className={className} />
  ),
  RotateCcw: ({ className }: { className?: string }) => (
    <span data-testid="icon-retry" className={className} />
  ),
}));

// Mock UI
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

import { ErrorBoundary } from './error-boundary';

// Helper component that throws
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>All good</div>;
}

// Suppress console.error during ErrorBoundary tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders default error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('This section failed to load.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders custom title and description', () => {
    render(
      <ErrorBoundary title="Chart error" description="Could not render chart.">
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Chart error')).toBeInTheDocument();
    expect(screen.getByText('Could not render chart.')).toBeInTheDocument();
  });

  it('renders custom fallback instead of default UI', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls onError callback when a child throws', () => {
    const onError = jest.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it('resets error state when Retry is clicked', () => {
    // We use a ref to control throws between renders
    let shouldThrow = true;

    function ConditionalThrow() {
      if (shouldThrow) throw new Error('Oops');
      return <div>Recovered</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop throwing and click retry
    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));

    // After reset, component re-renders children
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
