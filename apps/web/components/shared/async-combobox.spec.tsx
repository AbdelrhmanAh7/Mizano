import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AsyncCombobox, type ComboboxPage } from './async-combobox';

jest.mock('next-intl', () => {
  const messages = jest.requireActual('@/messages/ar/common.json').combobox;
  return {
    useTranslations:
      () =>
      (key: string, values?: Record<string, string | number>): string =>
        String(messages[key] ?? key).replace(/\{(\w+)\}/g, (_, n: string) => String(values?.[n])),
  };
});

// 45 customers on the server, 20 per page: the 41st+ are only reachable by paging or search.
const all = Array.from({ length: 45 }, (_, i) => ({ id: `c${i + 1}`, label: `عميل ${i + 1}` }));
const search = jest.fn(async (query: string, page: number): Promise<ComboboxPage> => {
  const hits = all.filter((c) => c.label.includes(query));
  return {
    options: hits.slice((page - 1) * 20, page * 20),
    totalPages: Math.ceil(hits.length / 20),
  };
});

function Harness({ onValueChange }: { onValueChange: jest.Mock }) {
  const [value, setValue] = useState('');
  return (
    <AsyncCombobox
      queryKey={['test']}
      search={search}
      value={value}
      onValueChange={(id, option) => {
        setValue(id);
        onValueChange(id, option);
      }}
      placeholder="اختر عميلاً"
    />
  );
}

function renderPicker(): jest.Mock {
  const onValueChange = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness onValueChange={onValueChange} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('combobox'));
  return onValueChange;
}

describe('AsyncCombobox (audit B11)', () => {
  it('reaches records past the first page by paging and server search, by keyboard, in Arabic', async () => {
    // A failed lookup is an error with Retry, never "no results" (review-lessons §11).
    search.mockRejectedValueOnce(new Error('offline'));
    const onValueChange = renderPicker();
    expect(await screen.findByText('تعذّر تحميل القائمة.')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد نتائج')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(await screen.findByText('عميل 1')).toBeInTheDocument();
    expect(screen.getByText('صفحة 1 من 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByText('عميل 21')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByText('عميل 41')).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith('', 3);

    const input = screen.getByRole('combobox', { name: 'بحث…' });
    fireEvent.change(input, { target: { value: '44' } });
    await waitFor(() => expect(search).toHaveBeenLastCalledWith('44', 1));
    await waitFor(() => expect(screen.queryByText('عميل 41')).not.toBeInTheDocument());
    expect(screen.getByText('عميل 44')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('c44', expect.objectContaining({ id: 'c44' }));
    expect(screen.getByRole('combobox')).toHaveTextContent('عميل 44');
  });
});
