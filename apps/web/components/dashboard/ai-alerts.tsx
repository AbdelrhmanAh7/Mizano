'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AIAlert, getAlertStyles } from '@/lib/hooks/use-dashboard';
import { Link } from '@/i18n/routing';

interface AIAlertsProps {
  alerts: AIAlert[];
}

function AlertIcon({ severity }: { severity: AIAlert['severity'] }) {
  switch (severity) {
    case 'error':
      return <AlertCircle className="h-5 w-5" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5" />;
    case 'info':
    default:
      return <Info className="h-5 w-5" />;
  }
}

export function AIAlerts({ alerts }: AIAlertsProps) {
  const t = useTranslations('common.dashboard.aiAlerts');

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('noAlerts')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
          </span>
          {t('title')}
          <span className="ms-auto text-sm font-normal text-muted-foreground">
            {alerts.length === 1
              ? t('alertCount', { count: alerts.length })
              : t('alertsCount', { count: alerts.length })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => {
            const styles = getAlertStyles(alert.severity);
            return (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  styles.bg,
                  styles.border,
                )}
              >
                <div className={styles.color}>
                  <AlertIcon severity={alert.severity} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{alert.message}</p>
                </div>
                {alert.link && (
                  <Button variant="ghost" size="sm" asChild className="shrink-0">
                    <Link href={alert.link}>
                      <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
