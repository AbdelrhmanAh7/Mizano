'use client';

import { Component, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
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

/** The fallback card; a function component so it can read the user's language. */
function WidgetErrorFallback({ widgetId, onRetry }: { widgetId?: string; onRetry: () => void }) {
  const t = useTranslations('common.dashboard.widgetError');
  return (
    <Card className="border-destructive/50">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <span>{widgetId ? t('failedWithId', { id: widgetId }) : t('failed')}</span>
          <Button variant="ghost" size="sm" onClick={onRetry} className="ml-auto gap-1">
            <RotateCcw className="h-3 w-3" />
            {t('retry')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, _errorInfo: React.ErrorInfo) {
    console.error(
      `Widget error [${this.props.widgetId || 'unknown'}]:`,
      error.message,
      error.stack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <WidgetErrorFallback
          widgetId={this.props.widgetId}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      );
    }

    return this.props.children;
  }
}
