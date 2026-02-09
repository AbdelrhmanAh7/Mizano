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

const settingsGroups = [
  {
    title: 'General',
    items: [
      {
        title: 'Organization',
        description: 'Company name, address, contact info, and currency',
        href: '/settings/organization',
        icon: Building2,
      },
      {
        title: 'Localization',
        description: 'Date format, number format, and timezone',
        href: '/settings/localization',
        icon: Globe,
      },
      {
        title: 'Branding',
        description: 'Logo, colors, and invoice footer text',
        href: '/settings/branding',
        icon: Palette,
      },
    ],
  },
  {
    title: 'Financial',
    items: [
      {
        title: 'Financial Settings',
        description: 'Fiscal year, lock date, and payment terms',
        href: '/settings/financial',
        icon: CreditCard,
      },
      {
        title: 'Default Accounts',
        description: 'Default GL accounts for AR, AP, revenue, and more',
        href: '/settings/accounts',
        icon: Receipt,
      },
      {
        title: 'Invoice & Document',
        description: 'Prefixes, numbering, default notes, and terms',
        href: '/settings/invoicing',
        icon: Receipt,
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        title: 'AI Features',
        description: 'Toggle AI categorization, OCR, forecasting, and anomaly detection',
        href: '/settings/ai',
        icon: Brain,
      },
      {
        title: 'Notifications',
        description: 'Configure notification preferences',
        href: '/settings/notifications',
        icon: Bell,
      },
      {
        title: 'Team & Roles',
        description: 'Manage team members and role permissions',
        href: '/settings/team',
        icon: Users,
      },
      {
        title: 'Performance',
        description: 'Monitor database performance and query optimization',
        href: '/settings/performance',
        icon: Activity,
      },
      {
        title: 'Cache Management',
        description: 'Monitor and manage API response caching',
        href: '/settings/cache',
        icon: Database,
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your organization settings and preferences</p>
      </div>

      {/* Settings Groups */}
      {settingsGroups.map((group) => (
        <div key={group.title} className="space-y-4">
          <h2 className="text-lg font-semibold">{group.title}</h2>
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
                        <CardTitle className="text-base">{item.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{item.description}</CardDescription>
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
