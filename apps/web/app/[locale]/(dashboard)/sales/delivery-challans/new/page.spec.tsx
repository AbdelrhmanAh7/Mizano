/**
 * Tests for NewDeliveryChallanPage.
 *
 * Bug: `/sales/delivery-challans/new` was caught by the `[id]` dynamic route,
 * which called `GET /api/delivery-challans/new` and returned 404.
 *
 * Fix: Added an explicit `/new` directory with its own page.tsx so Next.js
 * matches it before the dynamic `[id]` segment.
 *
 * These tests verify the dedicated create page renders correctly without
 * attempting to fetch a challan with id="new".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/sales/delivery-challans/new',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUseCreateDeliveryChallan = jest.fn();
jest.mock('@/lib/hooks/use-delivery-challans', () => ({
  useCreateDeliveryChallan: () => mockUseCreateDeliveryChallan(),
}));

const mockUseCustomers = jest.fn();
jest.mock('@/lib/hooks/use-customers', () => ({
  useCustomers: () => mockUseCustomers(),
}));

const mockUseItems = jest.fn();
jest.mock('@/lib/hooks/use-items', () => ({
  useItems: () => mockUseItems(),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import NewDeliveryChallanPage from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderPage = () => render(<NewDeliveryChallanPage />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NewDeliveryChallanPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCreateDeliveryChallan.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockUseCustomers.mockReturnValue({
      data: {
        data: [
          { id: 'cust-1', name: 'Customer A' },
          { id: 'cust-2', name: 'Customer B' },
        ],
      },
    });
    mockUseItems.mockReturnValue({
      data: {
        data: [
          { id: 'item-1', name: 'Widget', sku: 'WDG-001' },
          { id: 'item-2', name: 'Gadget', sku: null },
        ],
      },
    });
  });

  it('renders without crashing (does not call API with id="new")', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders the page title', () => {
    renderPage();
    // useTranslations returns the key itself
    const titleElements = screen.getAllByText('deliveryChallans.newChallan');
    expect(titleElements.length).toBeGreaterThan(0);
  });

  it('renders customer select field', () => {
    renderPage();
    expect(screen.getByText('deliveryChallans.customer')).toBeInTheDocument();
  });

  it('renders type select field', () => {
    renderPage();
    expect(screen.getByText('deliveryChallans.type')).toBeInTheDocument();
  });

  it('renders date input field', () => {
    renderPage();
    expect(screen.getByText('deliveryChallans.date')).toBeInTheDocument();
    const dateInput = screen.getByLabelText('deliveryChallans.date');
    expect(dateInput).toHaveAttribute('type', 'date');
  });

  it('renders line items section', () => {
    renderPage();
    expect(screen.getByText('deliveryChallans.lineItems')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderPage();
    // The submit button shows the translation key when not pending
    const submitButton = screen.getByRole('button', { name: 'deliveryChallans.newChallan' });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();
  });

  it('shows "Creating..." text when submission is pending', () => {
    mockUseCreateDeliveryChallan.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: true,
    });
    renderPage();
    const submitButton = screen.getByRole('button', { name: 'Creating...' });
    expect(submitButton).toBeDisabled();
  });

  it('renders with empty customers list without crashing', () => {
    mockUseCustomers.mockReturnValue({ data: { data: [] } });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders with undefined customers data without crashing', () => {
    mockUseCustomers.mockReturnValue({ data: undefined });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders with empty items list without crashing', () => {
    mockUseItems.mockReturnValue({ data: { data: [] } });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders with undefined items data without crashing', () => {
    mockUseItems.mockReturnValue({ data: undefined });
    expect(() => renderPage()).not.toThrow();
  });

  it('renders Add Line button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /add line/i })).toBeInTheDocument();
  });

  it('renders notes textarea', () => {
    renderPage();
    expect(screen.getByText('deliveryChallans.notes')).toBeInTheDocument();
  });

  it('renders back to challans link', () => {
    renderPage();
    expect(screen.getByText('deliveryChallans.backToChallans')).toBeInTheDocument();
  });
});
