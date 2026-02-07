'use client';

import { signOut, useSession } from 'next-auth/react';
import { Bell, LogOut, User, HelpCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import { LanguageSwitcher } from './language-switcher';
import { useTourStore } from '@/lib/stores/use-tour-store';

export function Header() {
  const { data: session } = useSession();
  const locale = useLocale();
  const t = useTranslations('common.header');
  const pathname = usePathname();
  const { startTour } = useTourStore();
  const t_tour = useTranslations('tour.header');

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });

  // Map pathname to tour ID
  const getTourId = (): string | null => {
    if (pathname.includes('/sales/invoices')) return 'sales_invoices';
    if (pathname.includes('/sales/customers')) return 'sales_customers';
    if (pathname.includes('/inventory/items')) return 'inventory_items';
    if (pathname.includes('/accounting/journals')) return 'accounting_journals';
    if (pathname.includes('/purchases/bills')) return 'purchases_bills';
    if (pathname.includes('/purchases/vendors')) return 'purchases_vendors';
    return null;
  };

  return (
    <header className="bg-white dark:bg-card border-b border-gray-200 dark:border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-foreground">
            {t('welcomeBack', { name: session?.user?.firstName || '' })}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {getTourId() && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const tourId = getTourId();
                if (tourId) startTour(tourId);
              }}
              title={t_tour('helpTooltip')}
              aria-label={t_tour('startTour')}
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="relative" aria-label={t('notifications')}>
            <Bell className="h-5 w-5" />
            {(unreadCount?.data?.count ?? 0) > 0 && (
              <span className="absolute -top-1 -end-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
                {unreadCount?.data?.count}
              </span>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('profile')}>
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {session?.user?.firstName} {session?.user?.lastName}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: `/${locale}/login` })}>
                <LogOut className="me-2 h-4 w-4" />
                {t('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
