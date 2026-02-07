'use client';

import { useEffect } from 'react';
import { useTourStore } from '@/lib/stores/use-tour-store';
import { useUserPreferences } from '@/lib/hooks/use-user-preferences';

interface AutoTourTriggerProps {
  tourId: string;
  delay?: number; // Delay in milliseconds before starting the tour
}

export function AutoTourTrigger({
  tourId,
  delay = 1000,
}: AutoTourTriggerProps) {
  const { startTour } = useTourStore();
  const { data: preferences, isLoading } = useUserPreferences();

  useEffect(() => {
    if (isLoading || !preferences) return;

    // Check if tour was already completed or dismissed
    const tourProgress = preferences.tourProgress?.[tourId];
    const wasDismissed = preferences.tourDismissed?.includes(tourId);

    // Only auto-start if tour hasn't been completed and hasn't been dismissed
    if (!tourProgress?.completed && !wasDismissed) {
      const timer = setTimeout(() => {
        startTour(tourId);
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [tourId, preferences, isLoading, delay, startTour]);

  return null;
}
