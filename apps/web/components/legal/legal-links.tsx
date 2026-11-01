'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/** Footer with the terms of use and privacy policy: on the sign-in screens and the legal pages. */
export function LegalLinks({ className }: { className?: string }): JSX.Element {
  const t = useTranslations('legal.common');
  const link =
    'inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <footer className={cn('px-4 py-3 text-sm text-muted-foreground', className)}>
      <nav aria-label={t('nav')}>
        <ul className="flex flex-wrap items-center justify-center gap-x-6">
          <li>
            <Link href="/terms" className={link}>
              {t('terms')}
            </Link>
          </li>
          <li>
            <Link href="/privacy" className={link}>
              {t('privacy')}
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
