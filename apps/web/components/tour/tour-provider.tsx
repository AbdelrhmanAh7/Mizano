'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Driver } from 'driver.js';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTourStore } from '@/lib/stores/use-tour-store';
import { useUpdateTourProgress, useDismissTour } from '@/lib/hooks/use-user-preferences';
import { tourDefinitions } from './tour-definitions';

export function TourProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const tButtons = useTranslations('tour.common');
  const { currentTour, isActive, endTour, completeTour, dismissTour } = useTourStore();
  const updateTourMutation = useUpdateTourProgress();
  const dismissTourMutation = useDismissTour();
  const driverRef = useRef<Driver | null>(null);
  const isDestroyingRef = useRef(false);
  const pathname = usePathname();
  const startedOnRef = useRef<string | null>(null);

  // A tour belongs to the page it started on (#633). Leaving that page ends it without
  // marking it done or dismissed, so it can show again on its own page.
  useEffect(() => {
    if (!isActive) {
      startedOnRef.current = null;
    } else if (startedOnRef.current === null) {
      startedOnRef.current = pathname;
    } else if (startedOnRef.current !== pathname) {
      endTour();
    }
  }, [isActive, pathname, endTour]);

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
    [completeTour, dismissTour],
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
        // driver.js fills {{current}} and {{total}}; raw() keeps the braces from next-intl.
        progressText: tButtons.raw('progress') as string,
        nextBtnText: tButtons('next'),
        prevBtnText: tButtons('previous'),
        doneBtnText: tButtons('done'),
        popoverClass: isDirRtl ? 'driver-popover-rtl' : 'driver-popover-ltr',
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
  }, [isActive, currentTour, locale, tButtons, endTour, handleTourComplete]);

  return <>{children}</>;
}
