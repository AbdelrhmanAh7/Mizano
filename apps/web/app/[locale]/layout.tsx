import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { locales, localeDirections, type Locale } from '@/i18n/config';
import { Providers } from '@/components/providers';
import { NavigationProgress } from '@/components/navigation-progress';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mizano.app';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;

  return {
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}`])),
    },
    openGraph: {
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
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
    name: 'Mizano',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'AI-Powered ERP - Autonomous Accounting Platform for zero-touch accounting.',
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
        <Providers>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
        </Providers>
      </NextIntlClientProvider>
    </div>
  );
}
