import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { TourProvider } from '@/components/tour/tour-provider';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { RealtimeProvider } from '@/components/providers/realtime-provider';

const CommandPalette = dynamic(
  () => import('@/components/command-palette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);
const KeyboardShortcuts = dynamic(
  () => import('@/components/keyboard-shortcuts').then((m) => ({ default: m.KeyboardShortcuts })),
  { ssr: false },
);
const LoggerDashboard = dynamic(
  () =>
    import('@/components/logger/logger-dashboard').then((m) => ({ default: m.LoggerDashboard })),
  { ssr: false },
);

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect(`/${params.locale}/login`);
  }

  const sessionUser = {
    firstName: session.user.firstName || '',
    lastName: session.user.lastName || '',
  };

  return (
    <TourProvider>
      <RealtimeProvider>
        {/* Printing a page prints its content only: the shell, widgets and the scroll
            container (which would clip the page to one screen) are dropped in print. */}
        <div className="flex h-screen bg-background print:block print:h-auto">
          <div className="contents print:hidden">
            <Sidebar />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden lg:ml-0 ml-0 print:block print:overflow-visible">
            <div className="contents print:hidden">
              <Header sessionUser={sessionUser} />
            </div>
            <main className="flex-1 overflow-y-auto p-4 lg:p-6 print:overflow-visible print:p-0">
              <div className="print:hidden">
                <Breadcrumbs />
              </div>
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                {children}
              </div>
            </main>
          </div>
          <div className="contents print:hidden">
            <CommandPalette />
            <KeyboardShortcuts />
            <LoggerDashboard />
          </div>
        </div>
      </RealtimeProvider>
    </TourProvider>
  );
}
