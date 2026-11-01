/**
 * Regression for #633: the first-use tour of a list page opened over the invoice details page
 * when the user clicked an invoice right after arriving. A tour now ends when its page changes.
 */
import { act, render } from '@testing-library/react';
import { useTourStore } from '@/lib/stores/use-tour-store';
import { TourProvider } from './tour-provider';

let mockPathname = '/en/sales/invoices';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => Object.assign((key: string) => key, { raw: (key: string) => key }),
}));
jest.mock('@/lib/hooks/use-user-preferences', () => ({
  useUpdateTourProgress: () => ({ mutate: jest.fn() }),
  useDismissTour: () => ({ mutate: jest.fn() }),
}));

describe('TourProvider', () => {
  beforeEach(() => {
    mockPathname = '/en/sales/invoices';
    act(() => useTourStore.setState({ currentTour: null, isActive: false }));
  });

  it('ends the tour, without marking it done or dismissed, when the page changes', () => {
    const { rerender } = render(<TourProvider>x</TourProvider>);
    act(() => useTourStore.getState().startTour('sales_invoices'));
    expect(useTourStore.getState().isActive).toBe(true);

    mockPathname = '/en/sales/invoices/inv-1';
    rerender(<TourProvider>x</TourProvider>);

    const state = useTourStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.completedTours).not.toContain('sales_invoices');
    expect(state.dismissedTours).not.toContain('sales_invoices');
  });

  it('keeps the tour while the page stays the same', () => {
    const { rerender } = render(<TourProvider>x</TourProvider>);
    act(() => useTourStore.getState().startTour('sales_invoices'));
    rerender(<TourProvider>x</TourProvider>);
    expect(useTourStore.getState().isActive).toBe(true);
  });
});
