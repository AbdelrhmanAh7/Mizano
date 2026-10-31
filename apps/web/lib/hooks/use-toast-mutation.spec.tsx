import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useToastMutation } from './use-toast-mutation';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

function setup(mutationFn: (id: string) => Promise<unknown>) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const before = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useToastMutation({
        namespace: 'sales.invoices.toast',
        mutationFn,
        beforeInvalidate: before,
        invalidate: (id: string) => [['invoices'], ['invoices', id]],
        success: 'sent',
        error: 'sendError',
      }),
    { wrapper },
  );
  return { result, invalidate, before };
}

describe('useToastMutation', () => {
  beforeEach(() => mockToast.mockReset());

  it('refreshes the given keys and shows the translated success toast', async () => {
    const { result, invalidate, before } = setup(async () => ({ ok: true }));
    await act(() => result.current.mutateAsync('inv-1'));
    expect(before).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['invoices'],
      ['invoices', 'inv-1'],
    ]);
    expect(mockToast).toHaveBeenCalledWith({
      title: 'sales.invoices.toast.sent',
      description: 'sales.invoices.toast.sentDescription',
    });
  });

  it('shows the API message in a destructive toast and refreshes nothing on failure', async () => {
    const apiError = { response: { data: { message: 'Period is locked' } } };
    const { result, invalidate } = setup(async () => Promise.reject(apiError));
    act(() => result.current.mutate('inv-1'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'sales.invoices.toast.sendError',
      description: 'Period is locked',
    });
  });
});
