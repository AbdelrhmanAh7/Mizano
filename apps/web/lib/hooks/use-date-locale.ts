'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { ar, enUS } from 'react-day-picker/locale';

const DATE_STYLES = {
  /** "Oct 31, 2026" / "31 أكتوبر 2026" */
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  /** "October 31, 2026" / "31 أكتوبر 2026" */
  long: { dateStyle: 'long' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * Formats a date for display in the page language, with the month name and Western digits in
 * Arabic (like amounts and the PDFs). Display only: query parameters stay `yyyy-MM-dd`.
 */
export function useDateFormatter(
  style: keyof typeof DATE_STYLES = 'medium',
): (date: Date | string) => string {
  const locale = useLocale();
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(
      locale === 'ar' ? 'ar-u-nu-latn' : 'en-US',
      DATE_STYLES[style],
    );
    return (date) => formatter.format(typeof date === 'string' ? new Date(date) : date);
  }, [locale, style]);
}

/** `locale` and `dir` for the shared Calendar, so month and weekday names follow the page. */
export function useCalendarLocale(): { locale: typeof enUS; dir: 'ltr' | 'rtl' } {
  return useLocale() === 'ar' ? { locale: ar, dir: 'rtl' } : { locale: enUS, dir: 'ltr' };
}
