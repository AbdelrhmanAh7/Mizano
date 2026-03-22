'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentItem {
  id: string;
  name: string;
  sku?: string;
  salesPrice?: string;
  usedAt: number;
}

interface RecentItemsState {
  items: RecentItem[];
  addItem: (item: Omit<RecentItem, 'usedAt'>) => void;
  getRecentItems: () => RecentItem[];
  clear: () => void;
}

const MAX_RECENT_ITEMS = 10;

export const useRecentItemsStore = create<RecentItemsState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          // Remove existing entry for the same item id
          const filtered = state.items.filter((i) => i.id !== item.id);
          // Add to front with current timestamp, keep only the last MAX_RECENT_ITEMS
          const updated = [{ ...item, usedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT_ITEMS);
          return { items: updated };
        }),

      getRecentItems: () => {
        const { items } = get();
        // Already sorted by most recent (newest first) due to addItem logic
        return [...items].sort((a, b) => b.usedAt - a.usedAt);
      },

      clear: () => set({ items: [] }),
    }),
    {
      name: 'mizano-recent-items',
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
