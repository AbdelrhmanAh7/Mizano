import { createElement, ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  rangeToDays,
  rangeToMonths,
  useAnomalyTimeline,
  useGrossMarginTrend,
  usePaymentCollection,
} from './use-dashboard-sections';
import { api } from '@/lib/api';

const thisMonth = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 17) };
const allTime = { from: new Date(2000, 0, 1), to: new Date(2026, 9, 17) };

describe('dashboard section period window', () => {
  it('converts the resolved range to a trailing month/day window', () => {
    expect(rangeToMonths(thisMonth, 6)).toBe(1);
    expect(rangeToMonths({ from: new Date(2025, 9, 17), to: thisMonth.to }, 6)).toBe(13);
    expect(rangeToMonths(allTime, 6)).toBe(322);
    expect(rangeToDays(thisMonth, 30)).toBe(17);
  });

  it('keeps the legacy window when no range is passed', () => {
    expect(rangeToMonths(undefined, 6)).toBe(6);
    expect(rangeToDays(undefined, 90)).toBe(90);
  });

  describe('hooks', () => {
    afterEach(() => jest.restoreAllMocks());

    const setup = () => {
      const get = jest.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children);
      return { get, wrapper };
    };
    const urls = (get: jest.SpyInstance): string[] => get.mock.calls.map((c) => String(c[0]));

    it('requests the window of the passed range and refetches when the range changes', async () => {
      const { get, wrapper } = setup();
      const { rerender } = renderHook(({ range }) => useGrossMarginTrend(true, range), {
        wrapper,
        initialProps: { range: thisMonth },
      });
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      rerender({ range: allTime });
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
      expect(urls(get)).toEqual([
        '/reports/dashboard/gross-margin-trend?months=1',
        '/reports/dashboard/gross-margin-trend?months=322',
      ]);
    });

    it('falls back to the previous 6-month window without a range', async () => {
      const { get, wrapper } = setup();
      renderHook(() => usePaymentCollection(true), { wrapper });
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      expect(urls(get)).toEqual(['/reports/dashboard/payment-collection?months=6']);
    });

    it('uses a day window for day-based endpoints', async () => {
      const { get, wrapper } = setup();
      renderHook(() => useAnomalyTimeline(true, thisMonth), { wrapper });
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      expect(urls(get)).toEqual(['/reports/dashboard/anomaly-timeline?days=17']);
    });
  });
});
