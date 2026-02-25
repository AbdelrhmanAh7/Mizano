'use client';

import { Fragment, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ChevronRight, Home } from 'lucide-react';

const segmentLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  sales: 'Sales',
  purchases: 'Purchases',
  accounting: 'Accounting',
  inventory: 'Inventory',
  banking: 'Banking',
  hr: 'HR',
  manufacturing: 'Manufacturing',
  projects: 'Projects',
  crm: 'CRM',
  tax: 'Tax',
  reports: 'Reports',
  settings: 'Settings',
  'ai-insights': 'AI Insights',
  'ai-lab': 'AI Lab',
  // Sub-pages
  customers: 'Customers',
  invoices: 'Invoices',
  quotes: 'Quotes',
  'credit-notes': 'Credit Notes',
  payments: 'Payments',
  vendors: 'Vendors',
  expenses: 'Expenses',
  bills: 'Bills',
  credits: 'Credits',
  accounts: 'Accounts',
  journals: 'Journal Entries',
  recurring: 'Recurring',
  items: 'Items',
  warehouses: 'Warehouses',
  adjustments: 'Adjustments',
  transfers: 'Transfers',
  reconcile: 'Reconciliation',
  rules: 'Rules',
  employees: 'Employees',
  attendance: 'Attendance',
  payroll: 'Payroll',
  bom: 'Bill of Materials',
  'work-orders': 'Work Orders',
  timesheets: 'Timesheets',
  leads: 'Leads',
  deals: 'Deals',
  rates: 'Tax Rates',
  returns: 'VAT Returns',
  scan: 'Scan Document',
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const locale = useLocale();

  const breadcrumbs = useMemo(() => {
    // Remove locale prefix
    const path = pathname.replace(`/${locale}`, '') || '/';
    if (path === '/' || path === '/dashboard') return [];

    const segments = path.split('/').filter(Boolean);
    // Skip if it looks like a detail page with an ID (cuid or uuid)
    const crumbs = segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/');
      const isId = /^[a-z0-9]{20,}$/i.test(segment) || /^[0-9a-f-]{36}$/i.test(segment);
      const label = isId
        ? 'Details'
        : segmentLabels[segment] ||
          segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { label, href, isLast: index === segments.length - 1 };
    });

    return crumbs;
  }, [pathname, locale]);

  if (breadcrumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
    >
      <Link href="/dashboard" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {breadcrumbs.map((crumb) => (
        <Fragment key={crumb.href}>
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground truncate max-w-[200px]">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors truncate max-w-[200px]"
            >
              {crumb.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
