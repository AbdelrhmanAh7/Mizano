'use client';

import { useLocale } from 'next-intl';

export function useFormatters() {
  const locale = useLocale();

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions) => {
    return new Date(date).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options,
    });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(locale).format(num);
  };

  const formatPercent = (num: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num / 100);
  };

  const formatRelativeTime = (date: Date | string) => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const now = new Date();
    const target = new Date(date);
    const diffInSeconds = Math.floor((target.getTime() - now.getTime()) / 1000);

    if (Math.abs(diffInSeconds) < 60) {
      return rtf.format(diffInSeconds, 'second');
    }
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (Math.abs(diffInMinutes) < 60) {
      return rtf.format(diffInMinutes, 'minute');
    }
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (Math.abs(diffInHours) < 24) {
      return rtf.format(diffInHours, 'hour');
    }
    const diffInDays = Math.floor(diffInHours / 24);
    if (Math.abs(diffInDays) < 30) {
      return rtf.format(diffInDays, 'day');
    }
    const diffInMonths = Math.floor(diffInDays / 30);
    if (Math.abs(diffInMonths) < 12) {
      return rtf.format(diffInMonths, 'month');
    }
    const diffInYears = Math.floor(diffInDays / 365);
    return rtf.format(diffInYears, 'year');
  };

  return {
    formatCurrency,
    formatDate,
    formatNumber,
    formatPercent,
    formatRelativeTime,
    locale,
  };
}
