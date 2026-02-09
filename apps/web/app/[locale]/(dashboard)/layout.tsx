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
  () => import('@/components/command-palette').then(m => ({ default: m.CommandPalette })),
  { ssr: false },
);
const KeyboardShortcuts = dynamic(
  () => import('@/components/keyboard-shortcuts').then(m => ({ default: m.KeyboardShortcuts })),
  { ssr: false },
);
const ChatWidget = dynamic(
  () => import('@/components/ai/chatbot/chat-widget').then(m => ({ default: m.ChatWidget })),
  { ssr: false },
);
const LoggerDashboard = dynamic(
  () => import('@/components/logger/logger-dashboard').then(m => ({ default: m.LoggerDashboard })),
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
        <div className="flex h-screen bg-background">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden lg:ml-0 ml-0">
            <Header sessionUser={sessionUser} />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6">
              <Breadcrumbs />
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                {children}
              </div>
            </main>
          </div>
          <CommandPalette />
          <KeyboardShortcuts />
          <ChatWidget />
          <LoggerDashboard />
        </div>
      </RealtimeProvider>
    </TourProvider>
  );
}
