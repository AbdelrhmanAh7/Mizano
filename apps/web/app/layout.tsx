import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
import { getLocale } from 'next-intl/server';
import { BRAND } from '@mizano/shared-types';
import { defaultLocale, localeDirections, locales, type Locale } from '@/i18n/config';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-noto-arabic',
  display: 'swap',
});

const DESCRIPTION =
  'Accounting in Arabic and English for businesses in Egypt, Saudi Arabia and the UAE: invoices, bills, journals and reports. AI is optional.';

export const metadata: Metadata = {
  title: {
    default: BRAND.tagline.en,
    template: `%s | ${BRAND.name.en}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND.name.en,
  keywords: [
    'ERP',
    'accounting',
    'invoicing',
    'AI accounting',
    'small business',
    'financial management',
  ],
  authors: [{ name: BRAND.name.en }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5001'),
  openGraph: {
    type: 'website',
    siteName: BRAND.name.en,
    title: BRAND.tagline.en,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND.tagline.en,
    description: DESCRIPTION,
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/ico/favicon.ico', sizes: 'any' },
      { url: '/png/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/png/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/svg/logo-icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/png/apple-touch-icon.png' }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Root layout - must have html/body tags.
// The middleware tags every page request with its locale (next-intl), so the first HTML byte
// already carries lang/dir: no LTR flash on /ar, and screen readers, print and no-JS get RTL.
// LocaleDirectionProvider keeps them in sync after a client-side locale switch.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const requested = await getLocale();
  const locale: Locale = (locales as readonly string[]).includes(requested)
    ? (requested as Locale)
    : defaultLocale;

  return (
    <html lang={locale} dir={localeDirections[locale]} suppressHydrationWarning>
      <body className={`${inter.variable} ${notoArabic.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
