import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useParams: () => ({ id: 'wo-001', locale: 'en' }),
  usePathname: () => '/en/manufacturing/work-orders/wo-001',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const mockCompleteMutateAsync = jest.fn();
const mockUseWorkOrder = jest.fn();

jest.mock('@/lib/hooks/use-manufacturing', () => ({
  useWorkOrder: () => mockUseWorkOrder(),
  useDeleteWorkOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStartWorkOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCompleteWorkOrder: () => ({ mutateAsync: mockCompleteMutateAsync, isPending: false }),
  useCancelWorkOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordProduction: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProductionHistory: () => ({ data: [], isLoading: false }),
  getWorkOrderStatusColor: () => '',
  getWorkOrderStatusLabel: (s: string) => s,
}));

import WorkOrderDetailPage from './page';

describe('WorkOrderDetailPage completion', () => {
  const inProcessWorkOrder = {
    id: 'wo-001',
    workOrderNumber: 'WO-001',
    bomId: 'bom-001',
    quantity: 10,
    status: 'IN_PROCESS',
    notes: 'Test work order',
    plannedStartDate: '2026-03-01T00:00:00Z',
    plannedEndDate: '2026-03-05T00:00:00Z',
    actualStartDate: '2026-03-01T00:00:00Z',
    actualEndDate: null,
    outputItem: { id: 'item-out', name: 'Finished Product', sku: 'FP-01' },
    bom: {
      id: 'bom-001',
      name: 'Main BOM',
      outputQuantity: 1,
      items: [
        {
          id: 'bom-item-1',
          itemId: 'item-comp',
          quantity: 2,
          item: { id: 'item-comp', name: 'Component', sku: 'COMP-01' },
        },
      ],
    },
    materials: [
      {
        item: { id: 'item-comp', name: 'Component', sku: 'COMP-01' },
        required: 20,
        available: 50,
        shortfall: 0,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkOrder.mockReturnValue({
      data: inProcessWorkOrder,
      isLoading: false,
    });
    mockCompleteMutateAsync.mockResolvedValue({ id: 'wo-001', status: 'COMPLETED' });
  });

  it('completes work order by sending quantityProduced to mutation', async () => {
    render(<WorkOrderDetailPage />);

    // Click Complete button in the action bar
    const completeBtn = screen.getByRole('button', { name: /complete/i });
    fireEvent.click(completeBtn);

    // Dialog opens with quantity input
    const input = screen.getByLabelText(/quantity produced/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('10');

    // Change quantity produced to 5
    fireEvent.change(input, { target: { value: '5' } });
    expect(input.value).toBe('5');

    // Click Complete Production button in dialog
    const submitBtn = screen.getByRole('button', { name: /complete production/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCompleteMutateAsync).toHaveBeenCalledWith({
        id: 'wo-001',
        quantityProduced: 5,
      });
    });
  });

  it('disables completion button when quantityProduced is 0 or invalid', () => {
    render(<WorkOrderDetailPage />);

    const completeBtn = screen.getByRole('button', { name: /complete/i });
    fireEvent.click(completeBtn);

    const input = screen.getByLabelText(/quantity produced/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });

    const submitBtn = screen.getByRole('button', { name: /complete production/i });
    expect(submitBtn).toBeDisabled();
  });
});
