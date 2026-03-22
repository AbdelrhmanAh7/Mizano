import React from 'react';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from './breadcrumbs';

// Track the mock return values so tests can change them
let mockPathname = '/en/sales/invoices';
let mockLocale = 'en';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mockLocale,
}));

// Mock the i18n Link component (used by Breadcrumbs instead of next/link)
jest.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} data-testid={`link-${href}`}>
      {children}
    </a>
  ),
  routing: {
    locales: ['en', 'ar'],
    defaultLocale: 'en',
    localePrefix: 'always',
  },
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronRight: ({ className }: { className?: string }) => (
    <span data-testid="chevron" className={className}>
      {'>'}
    </span>
  ),
  Home: ({ className }: { className?: string }) => (
    <span data-testid="home-icon" className={className} />
  ),
}));

describe('Breadcrumbs', () => {
  beforeEach(() => {
    mockPathname = '/en/sales/invoices';
    mockLocale = 'en';
  });

  it('renders a Home link that points to /dashboard', () => {
    render(<Breadcrumbs />);
    const homeLink = screen.getByTestId('link-/dashboard');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/dashboard');
  });

  it('renders the home icon', () => {
    render(<Breadcrumbs />);
    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
  });

  it('renders breadcrumb segments from pathname', () => {
    mockPathname = '/en/sales/invoices';
    render(<Breadcrumbs />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('renders the last segment as plain text (not a link)', () => {
    mockPathname = '/en/sales/invoices';
    render(<Breadcrumbs />);
    const invoicesText = screen.getByText('Invoices');
    // The last segment should be a <span>, not inside an <a>
    expect(invoicesText.tagName).toBe('SPAN');
    expect(invoicesText.closest('a')).toBeNull();
  });

  it('renders intermediate segments as links', () => {
    mockPathname = '/en/sales/invoices';
    render(<Breadcrumbs />);
    const salesLink = screen.getByTestId('link-/sales');
    expect(salesLink).toBeInTheDocument();
    expect(salesLink.tagName).toBe('A');
  });

  it('renders chevron separators between crumbs', () => {
    mockPathname = '/en/sales/invoices';
    render(<Breadcrumbs />);
    const chevrons = screen.getAllByTestId('chevron');
    // Two segments (Sales, Invoices) = two chevrons
    expect(chevrons).toHaveLength(2);
  });

  it('returns null when on dashboard page', () => {
    mockPathname = '/en/dashboard';
    const { container } = render(<Breadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when on root page', () => {
    mockPathname = '/en';
    const { container } = render(<Breadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it('renders known labels from segmentLabels map', () => {
    mockPathname = '/en/accounting/journals';
    render(<Breadcrumbs />);
    expect(screen.getByText('Accounting')).toBeInTheDocument();
    expect(screen.getByText('Journal Entries')).toBeInTheDocument();
  });

  it('renders context-aware "Details" for ID-like segments (cuid)', () => {
    mockPathname = '/en/sales/invoices/clz1234567890abcdefgh';
    render(<Breadcrumbs />);
    expect(screen.getByText('Invoices Details')).toBeInTheDocument();
  });

  it('capitalizes unknown segments with hyphen-to-space conversion', () => {
    mockPathname = '/en/some-unknown-page';
    render(<Breadcrumbs />);
    expect(screen.getByText('Some Unknown Page')).toBeInTheDocument();
  });

  it('has aria-label "Breadcrumb" for accessibility', () => {
    mockPathname = '/en/sales/invoices';
    render(<Breadcrumbs />);
    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
  });

  it('handles deep nested paths', () => {
    mockPathname = '/en/purchases/bills/scan';
    render(<Breadcrumbs />);
    expect(screen.getByText('Purchases')).toBeInTheDocument();
    expect(screen.getByText('Bills')).toBeInTheDocument();
    expect(screen.getByText('Scan Document')).toBeInTheDocument();
  });
});
