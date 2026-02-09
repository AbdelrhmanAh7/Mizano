'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SearchHistoryCacheEntry {
  query: string;
  resultType?: string;
  resultId?: string;
  resultTitle?: string;
  clickedAt: number;
}

interface SearchHistoryStoreState {
  recentSearches: SearchHistoryCacheEntry[];
  addSearch: (entry: Omit<SearchHistoryCacheEntry, 'clickedAt'>) => void;
  clearSearches: () => void;
  syncFromServer: (entries: SearchHistoryCacheEntry[]) => void;
}

const MAX_SEARCH_HISTORY = 20;

export const useSearchHistoryStore = create<SearchHistoryStoreState>()(
  persist(
    (set) => ({
      recentSearches: [],

      addSearch: (entry) =>
        set((state) => {
          // Remove existing entry for the same query
          const filtered = state.recentSearches.filter((s) => s.query !== entry.query);
          // Add to front with current timestamp
          const updated = [{ ...entry, clickedAt: Date.now() }, ...filtered].slice(
            0,
            MAX_SEARCH_HISTORY,
          );
          return { recentSearches: updated };
        }),

      clearSearches: () => set({ recentSearches: [] }),

      syncFromServer: (entries) =>
        set((state) => {
          // Merge server entries with local, dedup by query, keep newest
          const map = new Map<string, SearchHistoryCacheEntry>();

          // Local entries first (older can be overridden)
          for (const entry of state.recentSearches) {
            map.set(entry.query, entry);
          }

          // Server entries override local
          for (const entry of entries) {
            const existing = map.get(entry.query);
            if (!existing || entry.clickedAt > existing.clickedAt) {
              map.set(entry.query, entry);
            }
          }

          const merged = Array.from(map.values())
            .sort((a, b) => b.clickedAt - a.clickedAt)
            .slice(0, MAX_SEARCH_HISTORY);

          return { recentSearches: merged };
        }),
    }),
    {
      name: 'search-history-storage',
      partialize: (state) => ({ recentSearches: state.recentSearches }),
    },
  ),
);
