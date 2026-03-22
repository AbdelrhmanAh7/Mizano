import type { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mizano.app';

interface PageMetadataOptions {
  title: string;
  description?: string;
  path?: string;
  locale?: string;
  noIndex?: boolean;
}

/**
 * Generate consistent metadata for any page.
 *
 * Usage:
 * ```ts
 * export const metadata = createPageMetadata({
 *   title: 'Invoices',
 *   description: 'Manage your sales invoices',
 *   path: '/dashboard/invoices',
 * });
 * ```
 */
export function createPageMetadata(options: PageMetadataOptions): Metadata {
  const {
    title,
    description = 'AI-Powered ERP - Autonomous Accounting Platform',
    path = '',
    locale = 'en',
    noIndex = false,
  } = options;

  const fullTitle = title === 'Mizano' ? title : `${title} | Mizano`;
  const url = `${BASE_URL}/${locale}${path}`;

  return {
    title: fullTitle,
    description,
    ...(noIndex && { robots: { index: false, follow: false } }),
    alternates: {
      canonical: url,
      languages: {
        en: `${BASE_URL}/en${path}`,
        ar: `${BASE_URL}/ar${path}`,
      },
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: 'Mizano',
      type: 'website',
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
  };
}

/**
 * Generate metadata for dashboard pages (noIndex by default since they are authenticated).
 */
export function createDashboardMetadata(title: string, description?: string): Metadata {
  return {
    title: `${title} | Mizano`,
    description: description || `Manage ${title.toLowerCase()} in Mizano`,
    robots: { index: false, follow: false },
  };
}
