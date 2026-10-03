'use client';

import { useTranslations } from 'next-intl';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Calculator,
  FileText,
  Package,
  PieChart,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';

export default function ReportsPage() {
  const t = useTranslations('reports');

  const reportCategories = [
    {
      name: t('categories.financial'),
      description: t('categories.financialDescription'),
      reports: [
        {
          name: t('profitLoss.title'),
          description: t('profitLoss.description'),
          href: '/reports/profit-loss',
          icon: TrendingUp,
        },
        {
          name: t('balanceSheet.title'),
          description: t('balanceSheet.description'),
          href: '/reports/balance-sheet',
          icon: PieChart,
        },
        {
          name: t('cashFlow.title'),
          description: t('cashFlow.description'),
          href: '/reports/cash-flow',
          icon: BarChart3,
        },
      ],
    },
    {
      name: t('categories.aging'),
      description: t('categories.agingDescription'),
      reports: [
        {
          name: t('arAging.title'),
          description: t('arAging.description'),
          href: '/reports/ar-aging',
          icon: Users,
        },
        {
          name: t('apAging.title'),
          description: t('apAging.description'),
          href: '/reports/ap-aging',
          icon: Building2,
        },
      ],
    },
    {
      name: t('categories.sales'),
      description: t('categories.salesDescription'),
      reports: [
        {
          name: t('salesByCustomer.title'),
          description: t('salesByCustomer.description'),
          href: '/reports/sales-by-customer',
          icon: Users,
        },
        {
          name: t('salesByItem.title'),
          description: t('salesByItem.description'),
          href: '/reports/sales-by-item',
          icon: Package,
        },
        {
          name: t('purchasesByVendor.title'),
          description: t('purchasesByVendor.description'),
          href: '/reports/purchases-by-vendor',
          icon: ShoppingCart,
        },
      ],
    },
    {
      name: t('categories.accounting'),
      description: t('categories.accountingDescription'),
      reports: [
        {
          name: t('generalLedger.title'),
          description: t('generalLedger.description'),
          href: '/reports/general-ledger',
          icon: FileText,
        },
        {
          name: t('trialBalance.title'),
          description: t('trialBalance.description'),
          href: '/reports/trial-balance',
          icon: Calculator,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Report Categories */}
      <div className="space-y-8">
        {reportCategories.map((category) => (
          <div key={category.name}>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{category.name}</h2>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {category.reports.map((report) => (
                <Link key={report.name} href={report.href}>
                  <Card className="h-full hover:border-primary transition-colors cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <report.icon className="h-5 w-5 text-primary" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <CardTitle className="text-base">{report.name}</CardTitle>
                      <CardDescription>{report.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
