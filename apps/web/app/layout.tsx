import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-noto-arabic',
});

export const metadata: Metadata = {
  title: 'Mizano - AI-Powered ERP',
  description: 'Autonomous Accounting Platform - End of Traditional Accounting Era',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Root layout - must have html/body tags
// Locale layout sets lang/dir attributes via a wrapper div
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${notoArabic.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
