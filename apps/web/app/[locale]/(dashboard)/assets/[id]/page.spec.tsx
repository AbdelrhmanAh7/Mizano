import React from 'react';
import { render, screen } from '@testing-library/react';
import AssetDetailPage from './page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, _params?: Record<string, unknown>) => key,
}));

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  format: (_date: Date, _fmt: string) => '2024-01-01',
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  ArrowLeft: () => <svg data-testid="arrow-left" />,
  Trash2: () => <svg data-testid="trash2" />,
}));

const mockUseAsset = jest.fn();
const mockUseDeleteAsset = jest.fn();
const mockUseDisposeAsset = jest.fn();
const mockUseDepreciationSchedule = jest.fn();

jest.mock('@/lib/hooks/use-assets', () => ({
  useAsset: (...args: unknown[]) => mockUseAsset(...args),
  useDeleteAsset: () => mockUseDeleteAsset(),
  useDisposeAsset: () => mockUseDisposeAsset(),
  useDepreciationSchedule: (...args: unknown[]) => mockUseDepreciationSchedule(...args),
  getAssetTypeLabel: (t: string) => t,
  getAssetStatusColor: () => '',
  getAssetStatusLabel: (s: string) => s,
  getDepreciationMethodLabel: (m: string) => m,
  formatCurrency: (v: number) => `$${v}`,
  calculateRemainingLife: () => 48,
}));

// Stub UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    className,
    asChild,
    variant: _variant,
    size: _size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    asChild?: boolean;
    variant?: string;
    size?: string;
  }) => {
    if (asChild) return <>{children}</>;
    return (
      <button onClick={onClick} className={className}>
        {children}
      </button>
    );
  },
}));
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));
jest.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));
jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
}));
jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));
jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockAsset = {
  id: 'asset-002',
  assetNumber: 'AST-002',
  name: 'Office Chair',
  description: 'Ergonomic chair',
  assetType: 'FURNITURE',
  purchaseDate: '2024-01-01',
  purchasePrice: 800,
  salvageValue: 50,
  usefulLifeYears: 5,
  depreciationMethod: 'STRAIGHT_LINE',
  monthlyDepreciation: 12.5,
  accumulatedDepreciation: 75,
  currentBookValue: 725,
  status: 'ACTIVE',
  assetAccountId: 'acc-001',
  depreciationAccountId: 'acc-002',
  accumulatedDeprAccountId: 'acc-003',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

describe('AssetDetailPage', () => {
  beforeEach(() => {
    mockUseAsset.mockReturnValue({ data: mockAsset, isLoading: false });
    mockUseDeleteAsset.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockUseDisposeAsset.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockUseDepreciationSchedule.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Regression test: params must be accessed directly (not via React.use()) in Next.js 14.
  // Calling use() on a plain object throws "An unsupported type was passed to use(): [object Object]".
  it('should render without throwing when params is a plain object', () => {
    expect(() => render(<AssetDetailPage params={{ id: 'asset-002' }} />)).not.toThrow();
  });

  it('should extract the id from params and pass it to useAsset', () => {
    render(<AssetDetailPage params={{ id: 'asset-002' }} />);
    expect(mockUseAsset).toHaveBeenCalledWith('asset-002');
  });

  it('should use the id from params for the depreciation schedule query', () => {
    render(<AssetDetailPage params={{ id: 'asset-002' }} />);
    expect(mockUseDepreciationSchedule).toHaveBeenCalledWith('asset-002');
  });

  it('should render the asset name when data is loaded', () => {
    render(<AssetDetailPage params={{ id: 'asset-002' }} />);
    expect(screen.getByText('Office Chair')).toBeInTheDocument();
  });

  it('should render the asset number', () => {
    render(<AssetDetailPage params={{ id: 'asset-002' }} />);
    expect(screen.getByText(/AST-002/)).toBeInTheDocument();
  });

  it('should render loading skeletons when data is loading', () => {
    mockUseAsset.mockReturnValue({ data: undefined, isLoading: true });
    render(<AssetDetailPage params={{ id: 'asset-002' }} />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('should render not-found message when asset is null', () => {
    mockUseAsset.mockReturnValue({ data: null, isLoading: false });
    render(<AssetDetailPage params={{ id: 'asset-002' }} />);
    expect(screen.getByText('assetNotFound')).toBeInTheDocument();
  });

  it('should work with different asset ids', () => {
    render(<AssetDetailPage params={{ id: 'asset-999' }} />);
    expect(mockUseAsset).toHaveBeenCalledWith('asset-999');
  });
});
