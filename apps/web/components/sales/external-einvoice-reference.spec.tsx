import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/lib/api';
import { ExternalEInvoiceReference } from './external-einvoice-reference';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { patch: jest.fn() } }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function editor(canEdit = true, reference: string | null = 'old') {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalEInvoiceReference
        id="doc-1"
        kind="invoices"
        reference={reference}
        canEdit={canEdit}
      />
    </QueryClientProvider>,
  );
}

describe('ETA reference editor', () => {
  beforeEach(() => jest.clearAllMocks());
  it('sends only the reference and uses null to clear it', async () => {
    (api.patch as jest.Mock).mockResolvedValue({ data: {} });
    editor();
    fireEvent.change(screen.getByLabelText('label'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/invoices/doc-1/external-einvoice-reference', {
        externalEInvoiceNumber: null,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('saved');
  });
  it('keeps an error visible and allows retry without a false success', async () => {
    (api.patch as jest.Mock)
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce({ data: {} });
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('error');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('saved');
  });
  it('does not offer a write control without sales.edit', () => {
    editor(false, null);
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
