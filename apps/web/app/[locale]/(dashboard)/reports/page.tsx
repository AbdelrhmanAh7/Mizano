'use client';

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

const reportCategories = [
  {
    name: 'Financial Reports',
    description: 'Core financial statements',
    reports: [
      {
        name: 'Profit & Loss',
        description: 'Income and expenses over a period',
        href: '/reports/profit-loss',
        icon: TrendingUp,
      },
      {
        name: 'Balance Sheet',
        description: 'Assets, liabilities, and equity',
        href: '/reports/balance-sheet',
        icon: PieChart,
      },
      {
        name: 'Cash Flow Statement',
        description: 'Cash inflows and outflows',
        href: '/reports/cash-flow',
        icon: BarChart3,
      },
    ],
  },
  {
    name: 'Receivables & Payables',
    description: 'Track what you owe and are owed',
    reports: [
      {
        name: 'AR Aging',
        description: 'Outstanding customer invoices',
        href: '/reports/ar-aging',
        icon: Users,
      },
      {
        name: 'AP Aging',
        description: 'Outstanding vendor bills',
        href: '/reports/ap-aging',
        icon: Building2,
      },
    ],
  },
  {
    name: 'Sales & Purchase Reports',
    description: 'Analyze sales and purchasing performance',
    reports: [
      {
        name: 'Sales by Customer',
        description: 'Revenue breakdown by customer',
        href: '/reports/sales-by-customer',
        icon: Users,
      },
      {
        name: 'Sales by Item',
        description: 'Revenue breakdown by product/item',
        href: '/reports/sales-by-item',
        icon: Package,
      },
      {
        name: 'Purchases by Vendor',
        description: 'Purchase breakdown by vendor',
        href: '/reports/purchases-by-vendor',
        icon: ShoppingCart,
      },
    ],
  },
  {
    name: 'Accounting Reports',
    description: 'Detailed accounting records',
    reports: [
      {
        name: 'General Ledger',
        description: 'Account transaction history',
        href: '/reports/general-ledger',
        icon: FileText,
      },
      {
        name: 'Trial Balance',
        description: 'Account balances summary',
        href: '/reports/trial-balance',
        icon: Calculator,
      },
    ],
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Generate financial reports and analyze your business performance
        </p>
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
