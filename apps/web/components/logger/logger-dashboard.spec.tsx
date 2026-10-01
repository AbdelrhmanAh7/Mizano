/**
 * Tests for LoggerDashboard component.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock shared types
jest.mock('@mizano/shared-types', () => ({
  LogLevel: { ERROR: 'error', WARN: 'warn', INFO: 'info', DEBUG: 'debug' },
  LogSource: { FRONTEND: 'frontend', BACKEND: 'backend', AI_MODEL: 'ai-model' },
  LogCategory: {
    UNHANDLED_EXCEPTION: 'unhandled-exception',
    API_ERROR: 'api-error',
    VALIDATION_ERROR: 'validation-error',
    DATABASE_ERROR: 'database-error',
    AUTH_ERROR: 'auth-error',
    AI_INFERENCE_ERROR: 'ai-inference-error',
    AI_TRAINING_ERROR: 'ai-training-error',
    RENDER_ERROR: 'render-error',
    NETWORK_ERROR: 'network-error',
    BUSINESS_LOGIC: 'business-logic',
    PERFORMANCE: 'performance',
    DEPRECATION: 'deprecation',
    UNKNOWN: 'unknown',
  },
  LogStatus: { OPEN: 'open', FIXED: 'fixed', IGNORED: 'ignored', TEST_COVERED: 'test-covered' },
}));

// Mock lucide-react
jest.mock('lucide-react', () => {
  const icons: Record<string, React.FC<{ className?: string }>> = {};
  const iconNames = [
    'Bug',
    'AlertTriangle',
    'Trash2',
    'Copy',
    'Check',
    'CheckCheck',
    'X',
    'Filter',
    'RefreshCw',
    'ChevronDown',
    'ChevronRight',
    'Server',
    'Monitor',
    'Brain',
    'Sparkles',
    'ClipboardCopy',
    'ShieldCheck',
    'Eye',
    'EyeOff',
    'Search',
  ];
  for (const name of iconNames) {
    icons[name] = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className} />
    );
  }
  return icons;
});

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
    title,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className} title={title}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <span {...(props as Record<string, unknown>)}>{children}</span>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...(props as Record<string, unknown>)}>{children}</div>
  ),
  CardContent: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...(props as Record<string, unknown>)}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...(props as Record<string, unknown>)}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...(props as Record<string, unknown>)}>{children}</div>
  ),
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  SheetTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      data-testid="checkbox"
    />
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    className,
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
    className?: string;
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      data-testid="search-input"
    />
  ),
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode; asChild?: boolean }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange,
  }: {
    children?: React.ReactNode;
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <label>
      <input type="checkbox" checked={checked} onChange={() => onCheckedChange?.(!checked)} />
      {children}
    </label>
  ),
  DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

// Mock hooks
const mockUseLogger: Record<string, unknown> & {
  logs: Record<string, unknown>[];
  selectedIds: string[];
  stats: Record<string, unknown>;
  filter: Record<string, unknown>;
} = {
  logs: [] as Record<string, unknown>[],
  stats: {
    totalErrors: 0,
    totalWarnings: 0,
    openCount: 0,
    fixedCount: 0,
    testCoveredCount: 0,
    bySource: { frontend: 0, backend: 0, 'ai-model': 0 },
    byCategory: {},
  },
  filter: {},
  selectedIds: [] as string[],
  isOpen: true,
  logsLoading: false,
  accessDenied: false,
  isClearing: false,
  isGeneratingPrompt: false,
  setFilter: jest.fn(),
  resetFilter: jest.fn(),
  selectAll: jest.fn(),
  deselectAll: jest.fn(),
  toggleSelection: jest.fn(),
  markAsFixed: jest.fn(),
  markAsTestCovered: jest.fn(),
  markAsIgnored: jest.fn(),
  clearResolved: jest.fn(),
  clearAll: jest.fn(),
  clearSelected: jest.fn(),
  generateClaudePrompt: jest.fn().mockResolvedValue(null),
  setOpen: jest.fn(),
  toggle: jest.fn(),
  refetch: jest.fn(),
  captureError: jest.fn(),
  captureWarning: jest.fn(),
  captureAiError: jest.fn(),
};

jest.mock('@/lib/hooks/use-logger', () => ({
  useLogger: () => mockUseLogger,
}));

jest.mock('@/lib/hooks/use-global-error-capture', () => ({
  useGlobalErrorCapture: jest.fn(),
}));

import { LoggerDashboard } from './logger-dashboard';

describe('LoggerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLogger.logs = [];
    mockUseLogger.selectedIds = [];
    mockUseLogger.isOpen = true;
    mockUseLogger.logsLoading = false;
    mockUseLogger.accessDenied = false;
  });

  it('renders nothing for users who are not allowed to read the logs (401/403)', () => {
    mockUseLogger.accessDenied = true;
    const { container } = render(<LoggerDashboard />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText('Toggle error logger')).not.toBeInTheDocument();
  });

  it('should render the empty state when no logs', () => {
    render(<LoggerDashboard />);
    expect(screen.getByText('All clear!')).toBeInTheDocument();
    expect(screen.getByText('No errors or warnings to show')).toBeInTheDocument();
  });

  it('should render log entries', () => {
    mockUseLogger.logs = [
      {
        id: 'abc123',
        timestamp: new Date().toISOString(),
        level: 'error',
        source: 'backend',
        category: 'database-error',
        status: 'open',
        message: 'Database connection failed',
        occurrences: 3,
        fingerprint: 'abc123',
        hasTestCoverage: false,
      },
    ];

    render(<LoggerDashboard />);
    expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('should render Clear Fixed & Tested button', () => {
    render(<LoggerDashboard />);
    expect(screen.getByText('Clear Fixed & Tested')).toBeInTheDocument();
  });

  it('should call clearResolved when Clear Fixed & Tested button is clicked', () => {
    render(<LoggerDashboard />);
    fireEvent.click(screen.getByText('Clear Fixed & Tested'));
    expect(mockUseLogger.clearResolved).toHaveBeenCalled();
  });

  it('should render Fix Prompt button', () => {
    render(<LoggerDashboard />);
    expect(screen.getByText(/Fix Prompt/)).toBeInTheDocument();
  });

  it('should disable Fix Prompt when no selections', () => {
    mockUseLogger.selectedIds = [];
    render(<LoggerDashboard />);
    const btn = screen.getByText(/Fix Prompt/).closest('button');
    expect(btn).toBeDisabled();
  });

  it('should enable Fix Prompt when selections exist', () => {
    mockUseLogger.selectedIds = ['abc123'];
    render(<LoggerDashboard />);
    const btn = screen.getByText(/Fix Prompt/).closest('button');
    expect(btn).not.toBeDisabled();
  });

  it('should call generateClaudePrompt when button is clicked', async () => {
    mockUseLogger.selectedIds = ['abc123'];
    (mockUseLogger.generateClaudePrompt as jest.Mock).mockResolvedValue({
      prompt: '# Fix Errors',
      logCount: 1,
    });

    render(<LoggerDashboard />);
    fireEvent.click(screen.getByText(/Fix Prompt/));

    await waitFor(() => {
      expect(mockUseLogger.generateClaudePrompt).toHaveBeenCalled();
    });
  });

  it('should show loading state', () => {
    mockUseLogger.logsLoading = true;
    render(<LoggerDashboard />);
    expect(screen.getByText('Loading logs...')).toBeInTheDocument();
  });

  it('should show stats in the header', () => {
    mockUseLogger.stats = {
      totalErrors: 5,
      totalWarnings: 3,
      openCount: 6,
      fixedCount: 2,
      testCoveredCount: 1,
      bySource: { frontend: 2, backend: 4, 'ai-model': 2 },
      byCategory: {},
    };

    render(<LoggerDashboard />);
    expect(screen.getByText('5 errors')).toBeInTheDocument();
    expect(screen.getByText('3 warnings')).toBeInTheDocument();
    expect(screen.getByText('2 fixed')).toBeInTheDocument();
    expect(screen.getByText('1 tested')).toBeInTheDocument();
  });

  it('should show search input', () => {
    render(<LoggerDashboard />);
    expect(screen.getByPlaceholderText('Search errors...')).toBeInTheDocument();
  });

  it('should call setFilter on search', () => {
    render(<LoggerDashboard />);
    const input = screen.getByPlaceholderText('Search errors...');
    fireEvent.change(input, { target: { value: 'database' } });
    expect(mockUseLogger.setFilter).toHaveBeenCalledWith({ search: 'database' });
  });

  it('should show footer with counts', () => {
    mockUseLogger.logs = [
      {
        id: 'a',
        timestamp: new Date().toISOString(),
        level: 'error',
        source: 'backend',
        category: 'unknown',
        status: 'open',
        message: 'Test',
        occurrences: 1,
        fingerprint: 'a',
        hasTestCoverage: false,
      },
    ];

    render(<LoggerDashboard />);
    expect(screen.getByText('1 entries')).toBeInTheDocument();
  });
});
