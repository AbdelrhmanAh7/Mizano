import React from 'react';
import { render, screen } from '@testing-library/react';
import AssetsPage from './page';

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({
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
  );
});

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Plus: () => <svg data-testid="plus-icon" />,
  Trash2: () => <svg data-testid="trash-icon" />,
  Eye: () => <svg data-testid="eye-icon" />,
}));

// Mock use-assets hook
const mockUseAssets = jest.fn();
const mockUseAssetSummary = jest.fn();
const mockUseDeleteAsset = jest.fn();

jest.mock('@/lib/hooks/use-assets', () => ({
  useAssets: (...args: unknown[]) => mockUseAssets(...args),
  useAssetSummary: () => mockUseAssetSummary(),
  useDeleteAsset: () => mockUseDeleteAsset(),
  getAssetTypeLabel: (type: string) => type,
  getAssetStatusColor: () => '',
  getAssetStatusLabel: (status: string) => status,
  getDepreciationMethodLabel: (method: string) => method,
  formatCurrency: (val: number) => `$${val}`,
  AssetStatus: { ACTIVE: 'ACTIVE', DISPOSED: 'DISPOSED', FULLY_DEPRECIATED: 'FULLY_DEPRECIATED' },
  AssetType: { ELECTRONICS: 'ELECTRONICS', FURNITURE: 'FURNITURE' },
  DepreciationMethod: { STRAIGHT_LINE: 'STRAIGHT_LINE' },
}));

// Mock UI components — SelectItem must render with its value to detect the bug
jest.mock('@/components/ui/select', () => {
  const SelectItemCapture = ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option data-testid="select-item" data-value={value} value={value}>
      {children}
    </option>
  );
  return {
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: SelectItemCapture,
  };
});

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    className,
    asChild,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    asChild?: boolean;
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
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={className} />,
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

describe('AssetsPage', () => {
  beforeEach(() => {
    mockUseAssets.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUseAssetSummary.mockReturnValue({ data: null });
    mockUseDeleteAsset.mockReturnValue({ mutate: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Regression test: SelectItem must never have value="" (Radix UI throws on empty string values)
  it('should not render any SelectItem with an empty string value', () => {
    render(<AssetsPage />);

    const selectItems = screen.getAllByTestId('select-item');
    const emptyValueItems = selectItems.filter((item) => item.getAttribute('data-value') === '');
    expect(emptyValueItems).toHaveLength(0);
  });

  it('should render SelectItem for "all status" with a non-empty value', () => {
    render(<AssetsPage />);

    const selectItems = screen.getAllByTestId('select-item');
    const allStatusItem = selectItems.find((item) =>
      item.textContent?.includes('filters.allStatus'),
    );
    expect(allStatusItem).toBeDefined();
    expect(allStatusItem!.getAttribute('data-value')).not.toBe('');
    expect(allStatusItem!.getAttribute('data-value')).toBeTruthy();
  });

  it('should render SelectItem for "all types" with a non-empty value', () => {
    render(<AssetsPage />);

    const selectItems = screen.getAllByTestId('select-item');
    const allTypesItem = selectItems.find((item) => item.textContent?.includes('filters.allTypes'));
    expect(allTypesItem).toBeDefined();
    expect(allTypesItem!.getAttribute('data-value')).not.toBe('');
    expect(allTypesItem!.getAttribute('data-value')).toBeTruthy();
  });

  it('should pass undefined status to useAssets when "all" is selected (default)', () => {
    render(<AssetsPage />);

    expect(mockUseAssets).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
  });

  it('should pass undefined assetType to useAssets when "all" is selected (default)', () => {
    render(<AssetsPage />);

    expect(mockUseAssets).toHaveBeenCalledWith(expect.objectContaining({ assetType: undefined }));
  });

  it('should render the empty state when there are no assets', () => {
    render(<AssetsPage />);
    expect(screen.getByText('empty.noResults')).toBeInTheDocument();
  });

  it('should render a loading skeleton when data is loading', () => {
    mockUseAssets.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<AssetsPage />);
    // Skeletons render when isLoading is true; no table should appear
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('should render asset rows when data is available', () => {
    mockUseAssets.mockReturnValue({
      data: {
        data: [
          {
            id: 'asset-001',
            assetNumber: 'AST-001',
            name: 'Test Laptop',
            assetType: 'ELECTRONICS',
            depreciationMethod: 'STRAIGHT_LINE',
            purchasePrice: 2500,
            currentBookValue: 2000,
            status: 'ACTIVE',
          },
        ],
      },
      isLoading: false,
    });

    render(<AssetsPage />);

    expect(screen.getByText('Test Laptop')).toBeInTheDocument();
    expect(screen.getByText('AST-001')).toBeInTheDocument();
  });
});
