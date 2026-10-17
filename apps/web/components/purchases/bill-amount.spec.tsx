import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import en from '@/messages/en/purchases.json';
import ar from '@/messages/ar/purchases.json';

let mockLocale: 'en' | 'ar' = 'en';
let mockOrganizationId: string | undefined = 'org-1';
jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  useTranslations: () => (key: keyof typeof en.bills.currency) =>
    (mockLocale === 'ar' ? ar : en).bills.currency[key],
}));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { organizationId: mockOrganizationId } } }),
}));
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

import api from '@/lib/api';
import { useBaseCurrencyQuery } from '@/lib/hooks/use-organization';
import { formatCurrency } from '@/lib/hooks/use-bills';
import { BillAmount } from './bill-amount';

const mockGet = api.get as jest.Mock;

function Amount({ currencyCode }: { currencyCode?: string | null }): JSX.Element {
  const currencyQuery = useBaseCurrencyQuery();
  return (
    <BillAmount amount="1234.5000" currencyCode={currencyCode} currencyQuery={currencyQuery} />
  );
}

function renderAmount(currencyCode?: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (
    <QueryClientProvider client={client}>
      <Amount currencyCode={currencyCode} />
    </QueryClientProvider>
  );
  return { ...render(element), client };
}

describe.each(['en', 'ar'] as const)('bill currency states (%s)', (locale) => {
  beforeEach(() => {
    mockLocale = locale;
    mockOrganizationId = 'org-1';
    mockGet.mockReset();
  });

  const messages = (locale === 'ar' ? ar : en).bills.currency;

  it('shows a skeleton without an amount until the base currency arrives', async () => {
    let resolve!: (value: { data: { baseCurrency: string } }) => void;
    mockGet.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { container } = renderAmount(null);
    expect(
      screen.getByRole('status', { name: messages.loading }).querySelector('.animate-pulse'),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/1234|1,234|\$|USD/);

    await act(async () => resolve({ data: { baseCurrency: 'EGP' } }));
    await waitFor(() =>
      expect(container.textContent).toBe(formatCurrency('1234.5000', 'EGP', locale)),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('$');
  });

  it('shows a localized error and Retry, then renders the recovered currency', async () => {
    mockGet.mockRejectedValueOnce(new Error('HTTP 500'));
    const { container } = renderAmount();
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.error);
    expect(container.textContent).not.toMatch(/1234|1,234|\$|USD/);

    mockGet.mockResolvedValueOnce({ data: { baseCurrency: 'SAR' } });
    fireEvent.click(screen.getByRole('button', { name: messages.retry }));
    await waitFor(() =>
      expect(container.textContent).toBe(formatCurrency('1234.5000', 'SAR', locale)),
    );
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenLastCalledWith('/organization/base-currency');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('$');
  });

  it('uses an explicit document currency even when the ledger lookup fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('HTTP 500'));
    const { container, client } = renderAmount('AED');
    await waitFor(() =>
      expect(client.getQueryState(['organization', 'base-currency', 'org-1'])?.status).toBe(
        'error',
      ),
    );
    expect(container.textContent).toBe(formatCurrency('1234.5000', 'AED', locale));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('$');
  });

  it('hides a stale currency on refetch failure and recovers through Retry', async () => {
    mockGet.mockResolvedValueOnce({ data: { baseCurrency: 'EGP' } });
    const { container, client } = renderAmount();
    await waitFor(() =>
      expect(container.textContent).toBe(formatCurrency('1234.5000', 'EGP', locale)),
    );
    mockGet.mockRejectedValueOnce(new Error('HTTP 500'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['organization'] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.error);
    expect(container.textContent).not.toContain(formatCurrency('1234.5000', 'EGP', locale));
    mockGet.mockResolvedValueOnce({ data: { baseCurrency: 'SAR' } });
    fireEvent.click(screen.getByRole('button', { name: messages.retry }));
    await waitFor(() =>
      expect(container.textContent).toBe(formatCurrency('1234.5000', 'SAR', locale)),
    );
  });

  it('does not reuse another organization currency while its lookup is pending', async () => {
    mockGet.mockResolvedValueOnce({ data: { baseCurrency: 'EGP' } });
    const view = renderAmount();
    await waitFor(() =>
      expect(view.container.textContent).toBe(formatCurrency('1234.5000', 'EGP', locale)),
    );
    mockGet.mockReturnValueOnce(new Promise(() => undefined));
    mockOrganizationId = 'org-2';
    view.rerender(
      <QueryClientProvider client={view.client}>
        <Amount />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('status', { name: messages.loading })).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(/EGP|\$|USD/);
  });

  it('waits for the organization session without guessing a currency', () => {
    mockOrganizationId = undefined;
    const { container } = renderAmount();
    expect(screen.getByRole('status', { name: messages.loading })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\$|USD/);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('bill formatter', () => {
  it('formats only the currency supplied by the caller', () => {
    expect(formatCurrency('1234.5000', 'EGP')).toBe('EGP\u00a01,234.50');
    expect(formatCurrency('1234.5000', 'USD')).toBe('$1,234.50');
  });
});
