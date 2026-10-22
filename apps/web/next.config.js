const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

// Next.js loads env files automatically in this order:
// .env.$(NODE_ENV).local -> .env.local -> .env.$(NODE_ENV) -> .env
// APP_ENV (local|dev|sit|prod) is used by the API; Next.js uses NODE_ENV.
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@mizano/validators', '@mizano/shared-types'],
  eslint: {
    ignoreDuringBuilds: true,
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  productionBrowserSourceMaps: false,

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2592000,
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },

  async redirects() {
    return [
      {
        source: '/crm/customers',
        destination: '/sales/customers',
        permanent: false,
      },
      {
        source: '/crm/customers/new',
        destination: '/sales/customers/new',
        permanent: false,
      },
      {
        source: '/:locale(en|ar)/crm/customers',
        destination: '/:locale/sales/customers',
        permanent: false,
      },
      {
        source: '/:locale(en|ar)/crm/customers/new',
        destination: '/:locale/sales/customers/new',
        permanent: false,
      },
      {
        source: '/:locale(en|ar)/crm/customers/:id/edit',
        destination: '/:locale/sales/customers/:id/edit',
        permanent: false,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-Requested-With, Content-Type, Authorization, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(withNextIntl(nextConfig));
