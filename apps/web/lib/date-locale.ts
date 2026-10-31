'use client';

import { ar, enUS, type Locale } from 'date-fns/locale';
import { useLocale } from 'next-intl';

/**
 * date-fns locale for the app locale: Arabic month names ("31 أكتوبر 2026") with Western digits,
 * or English. Pass it to every user-facing `format(...)`.
 */
export function dateFnsLocale(locale: string): Locale {
  return locale === 'ar' ? ar : enUS;
}

export function useDateFnsLocale(): Locale {
  return dateFnsLocale(useLocale());
}
