import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentPage {
  href: string;
  label: string;
  timestamp: number;
}

interface RecentStoreState {
  recentPages: RecentPage[];
  addPage: (page: Omit<RecentPage, 'timestamp'>) => void;
  clearRecent: () => void;
}

const MAX_RECENT = 8;

export const useRecentStore = create<RecentStoreState>()(
  persist(
    (set) => ({
      recentPages: [],

      addPage: (page) =>
        set((state) => {
          // Remove existing entry for the same href
          const filtered = state.recentPages.filter((p) => p.href !== page.href);
          // Add to front with current timestamp
          const updated = [{ ...page, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
          return { recentPages: updated };
        }),

      clearRecent: () => set({ recentPages: [] }),
    }),
    {
      name: 'recent-pages-storage',
      partialize: (state) => ({ recentPages: state.recentPages }),
    },
  ),
);
