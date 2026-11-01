import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

// Rendered per request so the address comes from the running deployment, not the build machine.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/en/dashboard/', '/ar/dashboard/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
