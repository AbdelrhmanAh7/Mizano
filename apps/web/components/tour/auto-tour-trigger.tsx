'use client';

import { useEffect } from 'react';
import { useTourStore } from '@/lib/stores/use-tour-store';
import { useUserPreferences } from '@/lib/hooks/use-user-preferences';

interface AutoTourTriggerProps {
  tourId: string;
  delay?: number;
}

export function AutoTourTrigger({ tourId, delay = 1500 }: AutoTourTriggerProps) {
  const { startTour, isActive, isTourCompleted, isTourDismissed } = useTourStore();
  const { data: preferences, isLoading } = useUserPreferences();

  useEffect(() => {
    // Don't trigger if another tour is already active
    if (isActive) return;

    // Check local store first (instant, no API wait)
    if (isTourCompleted(tourId) || isTourDismissed(tourId)) return;

    // Wait for server preferences to also confirm
    if (isLoading) return;

    // Check server-side status if preferences are available
    if (preferences) {
      const tourProgress = preferences.tourProgress?.[tourId];
      const wasDismissed = preferences.tourDismissed?.includes(tourId);
      if (tourProgress?.completed || wasDismissed) return;
    }

    const timer = setTimeout(() => {
      startTour(tourId);
    }, delay);

    return () => clearTimeout(timer);
  }, [
    tourId,
    preferences,
    isLoading,
    delay,
    startTour,
    isActive,
    isTourCompleted,
    isTourDismissed,
  ]);

  return null;
}
