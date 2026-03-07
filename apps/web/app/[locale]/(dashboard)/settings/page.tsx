'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity,
  Bell,
  Brain,
  Building2,
  CreditCard,
  Database,
  Globe,
  Palette,
  Receipt,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';

interface SettingsItem {
  titleKey: string;
  descriptionKey: string;
  href: string;
  icon: LucideIcon;
}

interface SettingsGroup {
  groupKey: string;
  items: SettingsItem[];
}

const settingsGroups: SettingsGroup[] = [
  {
    groupKey: 'general',
    items: [
      {
        titleKey: 'organization',
        descriptionKey: 'organization',
        href: '/settings/organization',
        icon: Building2,
      },
      {
        titleKey: 'localization',
        descriptionKey: 'localization',
        href: '/settings/localization',
        icon: Globe,
      },
      {
        titleKey: 'branding',
        descriptionKey: 'branding',
        href: '/settings/branding',
        icon: Palette,
      },
    ],
  },
  {
    groupKey: 'financial',
    items: [
      {
        titleKey: 'financial',
        descriptionKey: 'financial',
        href: '/settings/financial',
        icon: CreditCard,
      },
      {
        titleKey: 'accounts',
        descriptionKey: 'accounts',
        href: '/settings/accounts',
        icon: Receipt,
      },
      {
        titleKey: 'invoicing',
        descriptionKey: 'invoicing',
        href: '/settings/invoicing',
        icon: Receipt,
      },
    ],
  },
  {
    groupKey: 'system',
    items: [
      {
        titleKey: 'ai',
        descriptionKey: 'ai',
        href: '/settings/ai',
        icon: Brain,
      },
      {
        titleKey: 'notifications',
        descriptionKey: 'notifications',
        href: '/settings/notifications',
        icon: Bell,
      },
      {
        titleKey: 'team',
        descriptionKey: 'team',
        href: '/settings/team',
        icon: Users,
      },
      {
        titleKey: 'performance',
        descriptionKey: 'performance',
        href: '/settings/performance',
        icon: Activity,
      },
      {
        titleKey: 'cache',
        descriptionKey: 'cache',
        href: '/settings/cache',
        icon: Database,
      },
    ],
  },
];

export default function SettingsPage() {
  const t = useTranslations('settings');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Settings Groups */}
      {settingsGroups.map((group) => (
        <div key={group.groupKey} className="space-y-4">
          <h2 className="text-lg font-semibold">{t(`groups.${group.groupKey}`)}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-base">
                          {t(`hub.${item.titleKey}.title`)}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>
                        {t(`hub.${item.descriptionKey}.description`)}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
