'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, AlertTriangle, Info, TrendingUp, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { notificationsApi } from '@/lib/api';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'ALERT':
    case 'WARNING':
      return AlertTriangle;
    case 'INSIGHT':
    case 'AI':
      return TrendingUp;
    case 'DOCUMENT':
      return FileText;
    default:
      return Info;
  }
}

function getEntityLink(entityType?: string, entityId?: string): string | null {
  if (!entityType || !entityId) return null;
  const routes: Record<string, string> = {
    INVOICE: '/sales/invoices',
    BILL: '/purchases/bills',
    EXPENSE: '/purchases/expenses',
    CUSTOMER: '/sales/customers',
    VENDOR: '/purchases/vendors',
    JOURNAL: '/accounting/journals',
    EMPLOYEE: '/hr/employees',
    ITEM: '/inventory/items',
    PROJECT: '/projects',
    LEAD: '/crm/leads',
    DEAL: '/crm/deals',
  };
  const base = routes[entityType];
  if (!base) return null;
  return `${base}/${entityId}`;
}

export function NotificationPanel() {
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll({ limit: 20, sort: 'createdAt:desc' }),
    refetchInterval: 60000,
  });

  const markAsRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const unreadCount = countData?.data?.count ?? 0;
  const notifications: Notification[] =
    notificationsData?.data?.data ?? notificationsData?.data ?? [];

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (!notification.isRead) {
        markAsRead.mutate(notification.id);
      }
      const link = getEntityLink(notification.entityType, notification.entityId);
      if (link) {
        router.push(`/${locale}${link}`);
      }
    },
    [locale, markAsRead, router],
  );

  // Group notifications by date
  const grouped = notifications.reduce<Record<string, Notification[]>>((acc, n) => {
    const date = new Date(n.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let group: string;
    if (date.toDateString() === today.toDateString()) {
      group = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      group = 'Yesterday';
    } else {
      group = 'Earlier';
    }
    if (!acc[group]) acc[group] = [];
    acc[group].push(n);
    return acc;
  }, {});

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -end-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground"
              onClick={() => markAllAsRead.mutate()}
            >
              <CheckCheck className="h-3 w-3 me-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div>
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <div className="px-4 py-2 bg-muted/50 sticky top-0 z-10">
                    <p className="text-xs font-medium text-muted-foreground">{group}</p>
                  </div>
                  {items.map((notification) => {
                    const Icon = getNotificationIcon(notification.type);
                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50',
                          !notification.isRead && 'bg-blue-50/50 dark:bg-blue-950/20',
                        )}
                      >
                        <div
                          className={cn(
                            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                            !notification.isRead
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-sm truncate',
                              !notification.isRead ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {notification.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        {!notification.isRead && (
                          <div className="flex-shrink-0 mt-1">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
