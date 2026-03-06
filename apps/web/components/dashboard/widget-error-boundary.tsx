'use client';

import { Component, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  widgetId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `Widget error [${this.props.widgetId || 'unknown'}]:`,
      error.message,
      error.stack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <span>
                Failed to load widget{this.props.widgetId ? ` (${this.props.widgetId})` : ''}.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="ml-auto gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
