'use client';

import { Fragment, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ChevronRight, Home } from 'lucide-react';

/** Title-cases an unknown path segment ("some-page" → "Some Page"). */
function humanize(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('navigation.breadcrumbs');

  const breadcrumbs = useMemo(() => {
    // Remove locale prefix
    const path = pathname.replace(`/${locale}`, '') || '/';
    if (path === '/' || path === '/dashboard') return [];

    const segments = path.split('/').filter(Boolean);
    // Skip if it looks like a detail page with an ID (cuid or uuid)
    const crumbs = segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/');
      const isId = /^[a-z0-9]{20,}$/i.test(segment) || /^[0-9a-f-]{36}$/i.test(segment);
      const labelOf = (s: string) => (t.has(s) ? t(s) : humanize(s));
      let label: string;
      if (isId) {
        const preceding = index > 0 ? segments[index - 1] : '';
        label = preceding ? t('details', { parent: labelOf(preceding) }) : t('detailsOnly');
      } else {
        label = labelOf(segment);
      }
      return { label, href, isLast: index === segments.length - 1 };
    });

    return crumbs;
  }, [pathname, locale, t]);

  if (breadcrumbs.length === 0) return null;

  return (
    <nav
      aria-label={t('label')}
      className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
    >
      <Link href="/dashboard" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {breadcrumbs.map((crumb) => (
        <Fragment key={crumb.href}>
          <ChevronRight className="h-3 w-3 flex-shrink-0 rtl:rotate-180" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground truncate max-w-[200px]">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors truncate max-w-[200px]"
            >
              {crumb.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
