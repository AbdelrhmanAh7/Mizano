'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TourState {
  currentTour: string | null;
  isActive: boolean;
  startTour: (tourId: string) => void;
  endTour: () => void;
  skipTour: (tourId: string) => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      currentTour: null,
      isActive: false,
      startTour: (tourId: string) =>
        set({ currentTour: tourId, isActive: true }),
      endTour: () => set({ currentTour: null, isActive: false }),
      skipTour: (tourId: string) =>
        set({ currentTour: null, isActive: false }),
    }),
    {
      name: 'tour-storage', // localStorage key
    }
  )
);
