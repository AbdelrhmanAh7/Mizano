'use client';

import { useEffect, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useLocale } from 'next-intl';
import { useTourStore } from '@/lib/stores/use-tour-store';
import { useUpdateTourProgress } from '@/lib/hooks/use-user-preferences';
import { tourDefinitions } from './tour-definitions';

export function TourProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const { currentTour, isActive, endTour } = useTourStore();
  const updateTourMutation = useUpdateTourProgress();
  const [driverInstance, setDriverInstance] = useState<any>(null);

  useEffect(() => {
    if (!isActive || !currentTour) {
      if (driverInstance) {
        driverInstance.destroy();
        setDriverInstance(null);
      }
      return;
    }

    const tourDef = tourDefinitions[currentTour]?.[locale];
    if (!tourDef) {
      endTour();
      return;
    }

    // Create driver instance with locale-specific text
    const isDirRtl = locale === 'ar';
    const driverObj = driver({
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      progressText:
        locale === 'ar' ? '{{current}} من {{total}}' : '{{current}} of {{total}}',
      nextBtnText: locale === 'ar' ? 'التالي' : 'Next',
      prevBtnText: locale === 'ar' ? 'السابق' : 'Previous',
      doneBtnText: locale === 'ar' ? 'إنهاء' : 'Done',
      onDestroyStarted: () => {
        // Update tour completion in backend
        updateTourMutation.mutate(
          {
            tourId: currentTour,
            completed: true,
            currentStep: driverObj.getActiveIndex() || 0,
          },
          {
            onSettled: () => {
              endTour();
              driverObj.destroy();
              setDriverInstance(null);
            },
          }
        );
      },
      popoverClass: isDirRtl ? 'driver-popover-rtl' : 'driver-popover-ltr',
      steps: tourDef.steps,
    });

    setDriverInstance(driverObj);
    driverObj.drive();

    return () => {
      if (driverObj) {
        driverObj.destroy();
      }
    };
  }, [isActive, currentTour, locale, endTour, updateTourMutation]);

  return <>{children}</>;
}
