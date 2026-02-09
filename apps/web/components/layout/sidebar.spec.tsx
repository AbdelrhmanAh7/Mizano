import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './sidebar';

// Track mockable values
let mockPathname = '/en/dashboard';
let mockLocale = 'en';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useParams: () => ({ locale: mockLocale }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mockLocale,
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({
    href,
    children,
    className,
    onClick,
    title,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    title?: string;
  }) => (
    <a href={href} className={className} onClick={onClick} title={title}>
      {children}
    </a>
  );
});

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        role: {
          permissions: [
            { module: 'sales', actions: ['view', 'create', 'edit', 'delete'] },
            { module: 'purchases', actions: ['view', 'create'] },
            { module: 'accounting', actions: ['view'] },
            { module: 'inventory', actions: ['view'] },
            { module: 'banking', actions: ['view'] },
            { module: 'projects', actions: ['view'] },
            { module: 'manufacturing', actions: ['view'] },
            { module: 'hr', actions: ['view'] },
            { module: 'tax', actions: ['view'] },
            { module: 'crm', actions: ['view'] },
            { module: 'reports', actions: ['view'] },
            { module: 'settings', actions: ['view'] },
          ],
        },
      },
    },
    status: 'authenticated',
  }),
}));

// Mock the i18n config
jest.mock('@/i18n/config', () => ({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localeNames: { en: 'English', ar: 'Arabic' },
  localeDirections: { en: 'ltr', ar: 'rtl' },
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>(
    ({ children, className, onClick, ...props }, ref) => (
      <button ref={ref} className={className} onClick={onClick} {...props}>
        {children}
      </button>
    ),
  ),
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="sheet" data-open={open}>{children}</div>
  ),
  SheetContent: ({ children, side }: { children: React.ReactNode; side?: string }) => (
    <div data-testid="sheet-content" data-side={side}>{children}</div>
  ),
  SheetHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sheet-header" className={className}>{children}</div>
  ),
  SheetTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sheet-title" className={className}>{children}</div>
  ),
  SheetTrigger: React.forwardRef<HTMLElement, { children: React.ReactNode; asChild?: boolean }>(
    ({ children }, ref) => <div ref={ref as React.Ref<HTMLDivElement>}>{children}</div>,
  ),
}));

// Mock lucide-react icons - return simple spans for all icons
jest.mock('lucide-react', () => {
  const createMockIcon = (name: string) => {
    const MockIcon = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className} />
    );
    MockIcon.displayName = name;
    return MockIcon;
  };

  return new Proxy(
    {},
    {
      get: (_target, prop: string) => createMockIcon(prop),
    },
  );
});

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    mockPathname = '/en/dashboard';
    mockLocale = 'en';
  });

  it('renders the app name', () => {
    render(<Sidebar />);
    // useTranslations returns the key itself, so the appName key is rendered
    const appNames = screen.getAllByText('appName');
    expect(appNames.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Dashboard navigation item', () => {
    render(<Sidebar />);
    const dashboardLinks = screen.getAllByText('dashboard');
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Sales navigation group with correct translation key', () => {
    render(<Sidebar />);
    const salesItems = screen.getAllByText('sales.title');
    expect(salesItems.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Purchases navigation group', () => {
    render(<Sidebar />);
    const purchasesItems = screen.getAllByText('purchases.title');
    expect(purchasesItems.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Accounting navigation group', () => {
    render(<Sidebar />);
    const accountingItems = screen.getAllByText('accounting.title');
    expect(accountingItems.length).toBeGreaterThanOrEqual(1);
  });

  it('renders AI-related navigation items', () => {
    render(<Sidebar />);
    const aiInsights = screen.getAllByText('aiInsights');
    expect(aiInsights.length).toBeGreaterThanOrEqual(1);
    const aiLab = screen.getAllByText('aiLab');
    expect(aiLab.length).toBeGreaterThanOrEqual(1);
  });

  it('highlights the active route with primary styling', () => {
    mockPathname = '/en/dashboard';
    render(<Sidebar />);
    // Dashboard is a direct link, so it gets the active style class
    const dashboardLinks = screen.getAllByText('dashboard');
    // At least one of them should have the active class
    const hasActiveLink = dashboardLinks.some(
      (link) =>
        link.closest('a')?.className.includes('bg-primary') ?? false,
    );
    expect(hasActiveLink).toBe(true);
  });

  it('expands a parent section when its child route is active', () => {
    mockPathname = '/en/sales/invoices';
    render(<Sidebar />);
    // When the path starts with /sales, the sales section should be expanded
    // and the child items should be visible
    const invoicesItems = screen.getAllByText('sales.invoices');
    expect(invoicesItems.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles section expansion when clicking a parent item', () => {
    mockPathname = '/en/dashboard';
    render(<Sidebar />);

    // Find the Sales button in the desktop sidebar
    const salesButtons = screen.getAllByText('sales.title');
    // Click on the first one (could be mobile or desktop)
    fireEvent.click(salesButtons[0]);

    // After clicking, child items should appear
    const customerItems = screen.getAllByText('sales.customers');
    expect(customerItems.length).toBeGreaterThanOrEqual(1);

    // Click again to collapse
    fireEvent.click(salesButtons[0]);
  });

  it('renders the collapse/expand button', () => {
    render(<Sidebar />);
    const collapseBtn = screen.getByLabelText('collapseSidebar');
    expect(collapseBtn).toBeInTheDocument();
  });

  it('collapses the sidebar when collapse button is clicked', () => {
    render(<Sidebar />);
    const collapseBtn = screen.getByLabelText('collapseSidebar');
    fireEvent.click(collapseBtn);

    // After collapsing, the expand button should appear
    const expandBtn = screen.getByLabelText('expandSidebar');
    expect(expandBtn).toBeInTheDocument();
  });

  it('renders a mobile menu trigger button', () => {
    render(<Sidebar />);
    const menuBtn = screen.getByLabelText('openMenu');
    expect(menuBtn).toBeInTheDocument();
  });

  it('renders Settings navigation item for users with settings permission', () => {
    render(<Sidebar />);
    const settingsItems = screen.getAllByText('settings');
    expect(settingsItems.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Reports navigation item for users with reports permission', () => {
    render(<Sidebar />);
    const reportsItems = screen.getAllByText('reports');
    expect(reportsItems.length).toBeGreaterThanOrEqual(1);
  });
});
