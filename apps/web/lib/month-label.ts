import { currentUiLocale } from './request-language';

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABEL = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: (\d{4}))?$/;

/**
 * A chart month label from the API ("Jan" or "Jan 2026", always English) in the screen language,
 * e.g. "يناير 2026" in Arabic (TestSprite AIO-020). Anything else is returned unchanged. Done when
 * drawn, not when fetched, so a cached answer follows a language switch.
 */
export function formatMonthLabel(value: unknown, locale: string | undefined): string {
  const text = String(value ?? '');
  const match = LABEL.exec(text);
  if (!match || !locale || locale.startsWith('en')) return text;
  const year = match[2] ? Number(match[2]) : 2000;
  const format = new Intl.DateTimeFormat(locale, {
    month: 'short',
    ...(match[2] ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  });
  return format.format(Date.UTC(year, EN_MONTHS.indexOf(match[1]), 1));
}

/** {@link formatMonthLabel} in the current screen language: a chart tick or tooltip formatter. */
export function monthLabel(value: unknown): string {
  return formatMonthLabel(value, currentUiLocale());
}
