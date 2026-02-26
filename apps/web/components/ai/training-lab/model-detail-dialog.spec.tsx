import React from 'react';
import { render, screen } from '@testing-library/react';
import { ModelDetailDialog } from './model-detail-dialog';
import type { AiModelConfig } from './all-models-config';

// Mock lucide-react icons to simple spans
jest.mock('lucide-react', () => ({
  CheckCircle2: ({ className }: { className?: string }) => (
    <span data-testid="icon-check" className={className} />
  ),
  XCircle: ({ className }: { className?: string }) => (
    <span data-testid="icon-x" className={className} />
  ),
  Clock: ({ className }: { className?: string }) => (
    <span data-testid="icon-clock" className={className} />
  ),
  BarChart3: ({ className }: { className?: string }) => (
    <span data-testid="icon-bar" className={className} />
  ),
  Database: ({ className }: { className?: string }) => (
    <span data-testid="icon-database" className={className} />
  ),
  MessageSquare: ({ className }: { className?: string }) => (
    <span data-testid="icon-message" className={className} />
  ),
  TrendingUp: ({ className }: { className?: string }) => (
    <span data-testid="icon-trending" className={className} />
  ),
  AlertTriangle: ({ className }: { className?: string }) => (
    <span data-testid="icon-alert" className={className} />
  ),
}));

// Mock Dialog components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
}));

// Mock Badge
jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    className,
    variant,
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

// Mock Tabs
jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="tabs" className={className}>
      {children}
    </div>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`tab-${value}`}>{children}</div>
  ),
  TabsList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="tabs-list" className={className}>
      {children}
    </div>
  ),
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button data-testid={`tab-trigger-${value}`}>{children}</button>
  ),
}));

// Mock Progress
jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
}));

// Mock hooks
jest.mock('@/lib/hooks/use-ai-training-lab', () => ({
  useModelHistory: () => ({ data: [] }),
  useTrainingStats: () => ({ data: null }),
  useTrainingReadiness: () => ({ data: null }),
  useRecentFeedback: () => ({ data: [] }),
}));

jest.mock('@/lib/hooks/use-ai-infrastructure', () => ({
  useAiFeedbackStats: () => ({ data: null }),
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const mockModel: AiModelConfig = {
  name: 'Account Classifier',
  feature: 'account_suggestion',
  description: 'Suggests GL accounts for transactions',
  icon: 'BarChart3',
  seedEndpoint: '/ai/training/account-suggestion/seed',
  trainingEndpoint: '/ai/training/account-suggestion/train',
};

describe('ModelDetailDialog', () => {
  it('renders DialogDescription when open', () => {
    render(<ModelDetailDialog model={mockModel} open={true} onOpenChange={() => {}} />);
    const description = screen.getByTestId('dialog-description');
    expect(description).toBeInTheDocument();
    expect(description).toHaveTextContent(
      'View model training data, version history, and feedback statistics',
    );
  });

  it('renders model name in title', () => {
    render(<ModelDetailDialog model={mockModel} open={true} onOpenChange={() => {}} />);
    const title = screen.getByTestId('dialog-title');
    expect(title).toHaveTextContent('Account Classifier - Details');
  });

  it('is not rendered when open is false', () => {
    render(<ModelDetailDialog model={mockModel} open={false} onOpenChange={() => {}} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('handles model={null} gracefully', () => {
    render(<ModelDetailDialog model={null} open={true} onOpenChange={() => {}} />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    const title = screen.getByTestId('dialog-title');
    expect(title).toHaveTextContent('- Details');
  });

  it('renders all four tab triggers', () => {
    render(<ModelDetailDialog model={mockModel} open={true} onOpenChange={() => {}} />);
    expect(screen.getByTestId('tab-trigger-overview')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trigger-training')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trigger-history')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trigger-feedback')).toBeInTheDocument();
  });
});
