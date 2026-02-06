'use client';

import { useSession } from 'next-auth/react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Use required:true to let NextAuth handle the redirect
  // Middleware also handles auth, so this is a safety net
  const { status } = useSession({
    required: true,
    onUnauthenticated() {
      // Middleware handles the actual redirect
      // This callback prevents additional redirects
    },
  });

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0 ml-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
