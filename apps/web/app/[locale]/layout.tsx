import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BRAND, brandName, brandTagline } from '@mizano/shared-types';
import { Suspense } from 'react';
import { locales, localeDirections, type Locale } from '@/i18n/config';
import { LocaleDirectionProvider } from '@/components/locale-direction-provider';
import { Providers } from '@/components/providers';
import { NavigationProgress } from '@/components/navigation-progress';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5001';

const DESCRIPTION: Record<'ar' | 'en', string> = {
  en: 'Accounting in Arabic and English for businesses in Egypt, Saudi Arabia and the UAE: invoices, bills, journals and reports. AI is optional.',
  ar: 'محاسبة بالعربية والإنجليزية للشركات في مصر والسعودية والإمارات: فواتير البيع والشراء والقيود والتقارير. الذكاء الاصطناعي اختياري.',
};
/** The share card (1200x630, both scripts); a child segment's openGraph replaces the parent's whole object. */
const SHARE_IMAGE = {
  url: '/social/og-image.png',
  width: 1200,
  height: 630,
  alt: `${BRAND.name.en} · ${BRAND.name.ar}`,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  const lang = locale === 'ar' ? 'ar' : 'en';

  return {
    title: { default: brandTagline(lang), template: `%s | ${brandName(lang)}` },
    description: DESCRIPTION[lang],
    applicationName: brandName(lang),
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}`])),
    },
    openGraph: {
      type: 'website',
      siteName: brandName(lang),
      title: brandTagline(lang),
      description: DESCRIPTION[lang],
      locale: lang === 'ar' ? 'ar_SA' : 'en_US',
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: brandTagline(lang),
      description: DESCRIPTION[lang],
      images: [SHARE_IMAGE.url],
    },
  };
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = params;

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  const messages = await getMessages();
  const direction = localeDirections[locale as Locale];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: BRAND.name.en,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'Accounting in Arabic and English for businesses in Egypt, Saudi Arabia and the UAE: invoices, bills, journals and reports. AI is optional.',
    url: BASE_URL,
  };

  return (
    <div lang={locale} dir={direction} className="font-sans antialiased">
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${locale}";document.documentElement.dir="${direction}";`,
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NextIntlClientProvider messages={messages}>
        <LocaleDirectionProvider dir={direction} lang={locale}>
          <Providers>
            <Suspense fallback={null}>
              <NavigationProgress />
            </Suspense>
            {children}
          </Providers>
        </LocaleDirectionProvider>
      </NextIntlClientProvider>
    </div>
  );
}
