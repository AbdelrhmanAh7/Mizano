'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { locales, localeNames, type Locale } from '@/i18n/config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('settings.appearance');

  const getTargetUrl = (targetLocale: Locale) => {
    if (!pathname) return `/${targetLocale}`;
    if (pathname.startsWith(`/${locale}`)) {
      return pathname.replace(`/${locale}`, `/${targetLocale}`);
    }
    return `/${targetLocale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  };

  const buttonLabel = locale === 'en' ? 'Language' : 'اللغة (Language)';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t('language')} aria-label={buttonLabel}>
          <Languages className="h-5 w-5" />
          <span className="sr-only">{buttonLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => {
          const targetUrl = getTargetUrl(loc);
          const isArabic = loc === 'ar';
          return (
            <DropdownMenuItem key={loc} asChild className={locale === loc ? 'bg-accent' : ''}>
              <Link
                href={targetUrl}
                hrefLang={loc}
                role="link"
                aria-label={isArabic ? 'Arabic (العربية)' : 'English'}
                className="flex w-full items-center justify-between cursor-pointer"
              >
                <span>{localeNames[loc]}</span>
                {isArabic && <span className="text-xs text-muted-foreground ml-2">Arabic</span>}
                {!isArabic && locale === 'ar' && (
                  <span className="text-xs text-muted-foreground mr-2">English</span>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
