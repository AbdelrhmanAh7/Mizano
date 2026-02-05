'use client';

import { signOut, useSession } from 'next-auth/react';
import { Bell, LogOut, User } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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

export function Header() {
  const { data: session } = useSession();
  const locale = useLocale();
  const t = useTranslations('common.header');

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });

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
