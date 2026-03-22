'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TourState {
  currentTour: string | null;
  isActive: boolean;
  completedTours: string[];
  dismissedTours: string[];
  startTour: (tourId: string) => void;
  endTour: () => void;
  completeTour: (tourId: string) => void;
  dismissTour: (tourId: string) => void;
  isTourCompleted: (tourId: string) => boolean;
  isTourDismissed: (tourId: string) => boolean;
  resetTours: () => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      currentTour: null,
      isActive: false,
      completedTours: [],
      dismissedTours: [],
      startTour: (tourId: string) => {
        const state = get();
        // Don't start if already completed or dismissed
        if (state.completedTours.includes(tourId) || state.dismissedTours.includes(tourId)) {
          return;
        }
        set({ currentTour: tourId, isActive: true });
      },
      endTour: () => set({ currentTour: null, isActive: false }),
      completeTour: (tourId: string) =>
        set((state) => ({
          currentTour: null,
          isActive: false,
          completedTours: state.completedTours.includes(tourId)
            ? state.completedTours
            : [...state.completedTours, tourId],
        })),
      dismissTour: (tourId: string) =>
        set((state) => ({
          currentTour: null,
          isActive: false,
          dismissedTours: state.dismissedTours.includes(tourId)
            ? state.dismissedTours
            : [...state.dismissedTours, tourId],
        })),
      isTourCompleted: (tourId: string) => get().completedTours.includes(tourId),
      isTourDismissed: (tourId: string) => get().dismissedTours.includes(tourId),
      resetTours: () => set({ completedTours: [], dismissedTours: [] }),
    }),
    {
      name: 'tour-storage',
      partialize: (state) => ({
        completedTours: state.completedTours,
        dismissedTours: state.dismissedTours,
      }),
    },
  ),
);
