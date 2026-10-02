import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BillForm } from './bill-form';

jest.mock('next-intl', () => ({
  useTranslations: () => {
    const fn = (key: string, params?: Record<string, unknown>) => {
      if (params?.line && params?.message) {
        return `Line ${params.line}: ${params.message}`;
      }
      return key;
    };
    fn.has = () => true;
    return fn;
  },
}));

jest.mock('@/lib/hooks/use-vendors', () => ({
  useVendors: () => ({
    data: { data: [{ id: 'v-1', name: 'Vendor 1' }] },
  }),
}));

describe('BillForm', () => {
  it('bill-form 100.01 inline error', async () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();

    render(
      <BillForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        scanDefaults={{
          vendorId: 'v-1',
          date: '2026-03-01',
          dueDate: '2026-03-31',
          lines: [
            {
              description: 'Service',
              quantity: '1',
              rate: '100',
              taxRate: '100.01',
            },
          ],
        }}
      />,
    );

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /create bill/i });
    fireEvent.click(submitButton);

    // Form should reject 100.01 and display inline error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/taxInvalid/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts taxRate <= 100', async () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();

    render(
      <BillForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        scanDefaults={{
          vendorId: 'v-1',
          date: '2026-03-01',
          dueDate: '2026-03-31',
          lines: [
            {
              description: 'Service',
              quantity: '1',
              rate: '100',
              taxRate: '100',
            },
          ],
        }}
      />,
    );

    const submitButton = screen.getByRole('button', { name: /create bill/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
