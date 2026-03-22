import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
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

export const metadata: Metadata = {
  title: {
    default: 'Mizano - AI-Powered ERP',
    template: '%s | Mizano',
  },
  description:
    'Autonomous Accounting Platform - Zero-touch accounting powered by AI. Invoicing, bills, banking, HR, inventory, and more.',
  applicationName: 'Mizano',
  keywords: [
    'ERP',
    'accounting',
    'invoicing',
    'AI accounting',
    'autonomous accounting',
    'small business',
    'financial management',
  ],
  authors: [{ name: 'Mizano' }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://mizano.app'),
  openGraph: {
    type: 'website',
    siteName: 'Mizano',
    title: 'Mizano - AI-Powered ERP',
    description: 'Autonomous Accounting Platform - Zero-touch accounting powered by AI.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mizano - AI-Powered ERP',
    description: 'Autonomous Accounting Platform - Zero-touch accounting powered by AI.',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/ico/favicon.ico', sizes: 'any' },
      { url: '/png/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/png/icon-192x192.png', sizes: '192x192', type: 'image/png' },
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

// Root layout - must have html/body tags
// Locale layout dynamically sets lang/dir via script injection
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body className={`${inter.variable} ${notoArabic.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
