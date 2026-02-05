import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mizano - AI-Powered ERP',
  description: 'Autonomous Accounting Platform - End of Traditional Accounting Era',
};

// Root layout is minimal - locale layout handles all rendering
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
