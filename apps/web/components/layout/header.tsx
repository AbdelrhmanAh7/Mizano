'use client';

import { signOut } from 'next-auth/react';
import { LogOut, User, HelpCircle, Search } from 'lucide-react';
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
import { LanguageSwitcher } from './language-switcher';
import { NotificationPanel } from './notification-panel';
import { useTourStore } from '@/lib/stores/use-tour-store';
import { RunningTimerWidget } from '@/components/projects/running-timer-widget';

interface HeaderProps {
  sessionUser?: { firstName: string; lastName: string };
}

export function Header({ sessionUser }: HeaderProps) {
  const locale = useLocale();
  const t = useTranslations('common.header');
  const pathname = usePathname();
  const { startTour } = useTourStore();
  const t_tour = useTranslations('tour.header');

  const getTourId = (): string | null => {
    const path = pathname.replace(/^\/[a-z]{2}/, '');
    if (path === '/dashboard' || path === '/') return 'dashboard';
    if (path.includes('/sales/invoices')) return 'sales_invoices';
    if (path.includes('/sales/customers')) return 'sales_customers';
    if (path.includes('/inventory/items')) return 'inventory_items';
    if (path.includes('/accounting/journals')) return 'accounting_journals';
    return null;
  };

  const openCommandPalette = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  };

  return (
    <header
      role="banner"
      className="bg-white dark:bg-card border-b border-gray-200 dark:border-border px-6 py-4 ps-14 lg:ps-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-foreground">
            {t('welcomeBack', { name: sessionUser?.firstName || '' })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Command palette trigger */}
          <Button
            variant="outline"
            size="sm"
            className="hidden md:flex items-center gap-2 text-muted-foreground h-8 px-3"
            onClick={openCommandPalette}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Search...</span>
            <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 hidden sm:inline-flex">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </Button>

          <RunningTimerWidget />
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

          <NotificationPanel />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('profile')}>
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {sessionUser?.firstName} {sessionUser?.lastName}
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
