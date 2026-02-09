'use client';

import { Button } from '@/components/ui/button';
import { AlertCircle, RotateCcw } from 'lucide-react';
import React, { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback UI shown when the error boundary catches an error */
  fallback?: ReactNode;
  /** Optional heading for the default error card */
  title?: string;
  /** Optional description for the default error card */
  description?: string;
  /** Called when the error boundary catches an error */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Reusable React error boundary for isolating component failures.
 * Wraps any component tree — if a child throws during render, this catches
 * it and shows a recovery UI instead of crashing the whole page.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary title="Chart failed to load">
 *   <RevenueChart />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-xl border bg-card p-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">{this.props.title || 'Something went wrong'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {this.props.description || 'This section failed to load.'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={this.handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
