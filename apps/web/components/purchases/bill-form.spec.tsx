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
  it.each(['100.01', '14.001', '-1', 'invalid'])('rejects taxRate %s inline', async (taxRate) => {
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
              taxRate,
            },
          ],
        }}
      />,
    );

    // Exercise the resolver directly: native number constraints can stop a button click
    // before React Hook Form validates negative or over-precision scan defaults.
    fireEvent.submit(screen.getByRole('button', { name: /create bill/i }).closest('form')!);

    // Reject over-limit, over-precision and malformed rates without submitting.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/taxInvalid/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(['100', '14.25', '0', ''])('accepts taxRate "%s"', async (taxRate) => {
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
              taxRate,
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
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ quantity: '1', rate: '100', taxRate })],
      }),
    );
  });
});
