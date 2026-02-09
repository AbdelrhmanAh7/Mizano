'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Driver } from 'driver.js';
import { useLocale } from 'next-intl';
import { useTourStore } from '@/lib/stores/use-tour-store';
import {
  useUpdateTourProgress,
  useDismissTour,
} from '@/lib/hooks/use-user-preferences';
import { tourDefinitions } from './tour-definitions';

export function TourProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const {
    currentTour,
    isActive,
    endTour,
    completeTour,
    dismissTour,
  } = useTourStore();
  const updateTourMutation = useUpdateTourProgress();
  const dismissTourMutation = useDismissTour();
  const driverRef = useRef<Driver | null>(null);
  const isDestroyingRef = useRef(false);

  const handleTourComplete = useCallback(
    (tourId: string, step: number, completed: boolean) => {
      if (completed) {
        updateTourMutation.mutate({
          tourId,
          completed: true,
          currentStep: step,
        });
        completeTour(tourId);
      } else {
        dismissTourMutation.mutate(tourId);
        dismissTour(tourId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completeTour, dismissTour]
  );

  useEffect(() => {
    if (!isActive || !currentTour) {
      if (driverRef.current && !isDestroyingRef.current) {
        isDestroyingRef.current = true;
        driverRef.current.destroy();
        driverRef.current = null;
        isDestroyingRef.current = false;
      }
      return;
    }

    const tourDef = tourDefinitions[currentTour]?.[locale];
    if (!tourDef) {
      endTour();
      return;
    }

    let cancelled = false;

    // Small delay to ensure DOM elements with data-tour attributes are rendered
    const startTimeout = setTimeout(async () => {
      // Dynamic import — only loads driver.js when a tour is actually triggered
      const [{ driver: createDriver }] = await Promise.all([
        import('driver.js'),
        // @ts-expect-error -- CSS imports have no type declarations
        import('driver.js/dist/driver.css'),
        // @ts-expect-error -- CSS imports have no type declarations
        import('@/styles/driver-overrides.css'),
      ]);

      if (cancelled) return;

      const isDirRtl = locale === 'ar';
      const tourId = currentTour;

      const driverObj = createDriver({
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        animate: true,
        smoothScroll: true,
        allowClose: true,
        disableActiveInteraction: true,
        stagePadding: 10,
        stageRadius: 8,
        progressText:
          locale === 'ar'
            ? '{{current}} من {{total}}'
            : '{{current}} of {{total}}',
        nextBtnText: locale === 'ar' ? 'التالي' : 'Next',
        prevBtnText: locale === 'ar' ? 'السابق' : 'Previous',
        doneBtnText: locale === 'ar' ? 'إنهاء' : 'Done',
        popoverClass: isDirRtl
          ? 'driver-popover-rtl'
          : 'driver-popover-ltr',
        onCloseClick: () => {
          // User clicked X — treat as dismiss (not complete)
          if (isDestroyingRef.current) return;
          isDestroyingRef.current = true;
          const step = driverObj.getActiveIndex() || 0;
          driverObj.destroy();
          driverRef.current = null;
          isDestroyingRef.current = false;
          handleTourComplete(tourId, step, false);
        },
        onDestroyStarted: () => {
          // Called when user clicks "Done" on last step
          if (isDestroyingRef.current) return;
          isDestroyingRef.current = true;
          const step = driverObj.getActiveIndex() || 0;
          const totalSteps = tourDef.steps.length;
          const isLastStep = step === totalSteps - 1;
          driverObj.destroy();
          driverRef.current = null;
          isDestroyingRef.current = false;
          handleTourComplete(tourId, step, isLastStep);
        },
        steps: tourDef.steps,
      });

      driverRef.current = driverObj;
      driverObj.drive();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(startTimeout);
      if (driverRef.current && !isDestroyingRef.current) {
        isDestroyingRef.current = true;
        driverRef.current.destroy();
        driverRef.current = null;
        isDestroyingRef.current = false;
      }
    };
  }, [isActive, currentTour, locale, endTour, handleTourComplete]);

  return <>{children}</>;
}
