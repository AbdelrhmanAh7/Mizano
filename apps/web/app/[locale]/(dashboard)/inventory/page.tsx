'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Package, Warehouse, ClipboardList, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function InventoryPage() {
  const t = useTranslations('inventory');

  const modules = [
    {
      title: t('items.title'),
      description: 'Manage your product catalog, pricing, and stock levels.',
      icon: Package,
      href: '/inventory/items',
      color: 'text-blue-600',
    },
    {
      title: t('warehouses.title'),
      description: 'Configure warehouse locations and manage inventory across sites.',
      icon: Warehouse,
      href: '/inventory/warehouses',
      color: 'text-green-600',
    },
    {
      title: t('adjustments.title'),
      description: 'Record stock adjustments, write-offs, and inventory corrections.',
      icon: ClipboardList,
      href: '/inventory/adjustments',
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${module.color}`}>
                  <module.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">{module.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="text-sm">{module.description}</CardDescription>
              <Link href={module.href}>
                <Button variant="outline" className="w-full group">
                  {t('common.open')}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
