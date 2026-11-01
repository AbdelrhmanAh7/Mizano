import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { locales, localeDirections, type Locale } from '@/i18n/config';
import { LocaleDirectionProvider } from '@/components/locale-direction-provider';
import { Providers } from '@/components/providers';
import { NavigationProgress } from '@/components/navigation-progress';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mizano.app';

const SITE_COPY = {
  ar: {
    title: 'ميزانو — برنامج المحاسبة بالعربية لأصحاب الأعمال والمحاسبين',
    description:
      'ارفع فاتورة المورّد، فيجهّز ميزانو قيدًا مسودة بمصدره، ومحاسبك يراجع ويوافق قبل أن يُرحَّل أي شيء. بالعربية، ومجاني خلال الفترة التجريبية.',
    keywords: [
      'محاسبة',
      'برنامج محاسبة',
      'قيود يومية',
      'ميزان المراجعة',
      'فواتير الموردين',
      'مصر',
      'أعمال صغيرة',
      'محاسب',
    ],
  },
  en: {
    title: 'Mizano — Arabic-first Accounting for Business Owners & Accountants',
    description:
      'Upload a supplier bill and Mizano prepares a draft entry with its source; your accountant reviews and approves before anything is posted. Free during the pilot.',
    keywords: [
      'accounting',
      'bookkeeping',
      'general ledger',
      'supplier bills',
      'trial balance',
      'small business',
      'Egypt',
    ],
  },
} as const;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  const isAr = locale === 'ar';
  const copy = isAr ? SITE_COPY.ar : SITE_COPY.en;

  return {
    title: {
      default: copy.title,
      template: '%s | Mizano',
    },
    description: copy.description,
    keywords: [...copy.keywords],
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}`])),
    },
    openGraph: {
      type: 'website',
      siteName: 'Mizano',
      title: copy.title,
      description: copy.description,
      locale: isAr ? 'ar_EG' : 'en_US',
      url: `${BASE_URL}/${locale}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description: copy.description,
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
  const isAr = locale === 'ar';
  const copy = isAr ? SITE_COPY.ar : SITE_COPY.en;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Mizano',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: copy.description,
    url: `${BASE_URL}/${locale}`,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EGP',
      description: isAr ? 'مجاني خلال الفترة التجريبية' : 'Free during the pilot',
    },
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
