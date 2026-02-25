import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { DashboardClient } from '@/components/dashboard/dashboard-client';
import { transformDashboardOverview } from '@/lib/hooks/use-dashboard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const queryClient = new QueryClient();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }

  // Prefetch critical KPI stats on the server — drives LCP element
  try {
    await queryClient.prefetchQuery({
      queryKey: ['dashboard', 'stats', undefined, undefined],
      queryFn: async () => {
        const res = await fetch(`${API_BASE_URL}/reports/dashboard`, { headers });
        if (!res.ok) return null;
        const json = await res.json();
        return transformDashboardOverview(json.data ?? json);
      },
    });
  } catch {
    // Silently fail — client will refetch
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
