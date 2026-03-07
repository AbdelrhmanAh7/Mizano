'use client';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { localeDirections, type Locale } from '@/i18n/config';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';
import {
  Activity,
  Banknote,
  BarChart3,
  Brain,
  Briefcase,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  DollarSign,
  Factory,
  FileText,
  FlaskConical,
  Landmark,
  Layers,
  LayoutDashboard,
  Menu,
  Package,
  Percent,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Target,
  UserCircle,
  Users,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

interface NavItem {
  nameKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  children?: NavItem[];
}

const navigationConfig: NavItem[] = [
  { nameKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    nameKey: 'sales.title',
    href: '/sales',
    icon: ShoppingCart,
    permission: 'sales.view',
    children: [
      { nameKey: 'sales.customers', href: '/sales/customers', icon: Users },
      { nameKey: 'sales.quotes', href: '/sales/quotes', icon: FileText },
      { nameKey: 'sales.invoices', href: '/sales/invoices', icon: Receipt },
      { nameKey: 'sales.creditNotes', href: '/sales/credit-notes', icon: CreditCard },
      { nameKey: 'sales.payments', href: '/sales/payments', icon: Banknote },
    ],
  },
  {
    nameKey: 'purchases.title',
    href: '/purchases',
    icon: Building2,
    permission: 'purchases.view',
    children: [
      { nameKey: 'purchases.vendors', href: '/purchases/vendors', icon: Users },
      { nameKey: 'purchases.expenses', href: '/purchases/expenses', icon: Receipt },
      { nameKey: 'purchases.bills', href: '/purchases/bills', icon: FileText },
      { nameKey: 'purchases.payments', href: '/purchases/payments', icon: Banknote },
      { nameKey: 'purchases.credits', href: '/purchases/credits', icon: CreditCard },
    ],
  },
  {
    nameKey: 'accounting.title',
    href: '/accounting',
    icon: Calculator,
    permission: 'accounting.view',
    children: [
      { nameKey: 'accounting.chartOfAccounts', href: '/accounting/accounts', icon: BarChart3 },
      { nameKey: 'accounting.journalEntries', href: '/accounting/journals', icon: FileText },
      { nameKey: 'accounting.recurring', href: '/accounting/recurring', icon: Clock },
    ],
  },
  {
    nameKey: 'inventory.title',
    href: '/inventory',
    icon: Package,
    permission: 'inventory.view',
    children: [
      { nameKey: 'inventory.items.title', href: '/inventory/items', icon: Package },
      { nameKey: 'inventory.warehouses.title', href: '/inventory/warehouses', icon: Warehouse },
      {
        nameKey: 'inventory.adjustments.title',
        href: '/inventory/adjustments',
        icon: ClipboardList,
      },
    ],
  },
  {
    nameKey: 'banking.title',
    href: '/banking',
    icon: Landmark,
    permission: 'banking.view',
    children: [
      { nameKey: 'banking.accounts.title', href: '/banking/accounts', icon: DollarSign },
      { nameKey: 'banking.reconciliation.title', href: '/banking/reconcile', icon: BarChart3 },
      { nameKey: 'banking.rules.title', href: '/banking/rules', icon: FileText },
    ],
  },
  {
    nameKey: 'projects.title',
    href: '/projects',
    icon: Briefcase,
    permission: 'projects.view',
    children: [
      { nameKey: 'projects.projects.title', href: '/projects', icon: Briefcase },
      { nameKey: 'projects.timesheets.title', href: '/projects/timesheets', icon: Clock },
    ],
  },
  {
    nameKey: 'manufacturing.title',
    href: '/manufacturing',
    icon: Factory,
    permission: 'manufacturing.view',
    children: [
      { nameKey: 'manufacturing.bom', href: '/manufacturing/bom', icon: Layers },
      { nameKey: 'manufacturing.workOrders', href: '/manufacturing/work-orders', icon: Wrench },
    ],
  },
  {
    nameKey: 'hr.title',
    href: '/hr',
    icon: UserCircle,
    permission: 'hr.view',
    children: [
      { nameKey: 'hr.employees.title', href: '/hr/employees', icon: Users },
      { nameKey: 'hr.attendance.title', href: '/hr/attendance', icon: Clock },
      { nameKey: 'hr.payroll.title', href: '/hr/payroll', icon: DollarSign },
    ],
  },
  {
    nameKey: 'tax.title',
    href: '/tax',
    icon: Percent,
    permission: 'tax.view',
    children: [
      { nameKey: 'tax.rates', href: '/tax/rates', icon: Percent },
      { nameKey: 'tax.vatReturns', href: '/tax/returns', icon: FileText },
      { nameKey: 'tax.payments', href: '/tax/payments', icon: DollarSign },
    ],
  },
  {
    nameKey: 'crm.title',
    href: '/crm',
    icon: Target,
    permission: 'crm.view',
    children: [
      { nameKey: 'crm.leads', href: '/crm/leads', icon: Users },
      { nameKey: 'crm.deals', href: '/crm/deals', icon: DollarSign },
    ],
  },
  { nameKey: 'reports', href: '/reports', icon: BarChart3, permission: 'reports.view' },
  { nameKey: 'aiInsights', href: '/ai-insights', icon: Brain },
  { nameKey: 'aiLab', href: '/ai-lab', icon: FlaskConical },
  { nameKey: 'deepSearch', href: '/ai-lab/deep-search', icon: Search },
  {
    nameKey: 'performance',
    href: '/settings/performance',
    icon: Activity,
    permission: 'settings.view',
  },
  { nameKey: 'settings', href: '/settings', icon: Settings, permission: 'settings.view' },
];

interface SidebarNavProps {
  collapsed?: boolean;
  onItemClick?: () => void;
}

function SidebarNav({ collapsed = false, onItemClick }: SidebarNavProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('navigation');
  const { hasPermission, isLoading } = usePermissions();
  const direction = localeDirections[locale as Locale];
  const isRtl = direction === 'rtl';

  // Remove locale prefix from pathname for matching
  const pathnameWithoutLocale = pathname.replace(`/${locale}`, '') || '/';

  // Initialize expanded items based on current path (lazy initializer, not a side effect)
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    const expanded: string[] = [];
    navigationConfig.forEach((item) => {
      if (item.children && pathnameWithoutLocale.startsWith(item.href)) {
        expanded.push(item.href);
      }
    });
    return expanded;
  });

  const toggleExpanded = useCallback((href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href],
    );
  }, []);

  // Filter navigation based on permissions
  const filteredNavigation = useMemo(
    () =>
      navigationConfig.filter((item) => {
        if (!item.permission) return true;
        if (isLoading) return false;
        return hasPermission(item.permission);
      }),
    [hasPermission, isLoading],
  );

  const renderNavItem = (item: NavItem, isChild = false) => {
    const isActive =
      pathnameWithoutLocale === item.href || pathnameWithoutLocale.startsWith(item.href + '/');
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded =
      expandedItems.includes(item.href) || pathnameWithoutLocale.startsWith(item.href);
    const translatedName = t(item.nameKey);

    // Build locale-aware href
    const localizedHref = `/${locale}${item.href}`;

    if (hasChildren && !collapsed) {
      return (
        <div key={item.nameKey}>
          <button
            onClick={() => toggleExpanded(item.href)}
            className={cn(
              'w-full group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors',
              isActive || isExpanded
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <div className="flex items-center">
              <item.icon
                className={cn(
                  'h-5 w-5 flex-shrink-0 me-3',
                  isActive || isExpanded
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              {translatedName}
            </div>
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                isExpanded && 'rotate-90',
                isRtl && !isExpanded && 'rotate-180',
              )}
            />
          </button>
          {isExpanded && (
            <div className="ms-4 mt-1 space-y-1">
              {item.children!.map((child) => renderNavItem(child, true))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.nameKey}
        href={localizedHref}
        onClick={onItemClick}
        className={cn(
          'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
          isChild && 'ps-6',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        title={collapsed ? translatedName : undefined}
      >
        <item.icon
          className={cn(
            'h-5 w-5 flex-shrink-0',
            collapsed ? '' : 'me-3',
            isActive
              ? 'text-primary-foreground'
              : 'text-muted-foreground group-hover:text-foreground',
          )}
        />
        {!collapsed && translatedName}
      </Link>
    );
  };

  return (
    <nav aria-label="Main navigation" className="flex-1 px-2 pb-4 space-y-1">
      {filteredNavigation.map((item) => renderNavItem(item))}
    </nav>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const locale = useLocale();
  const t = useTranslations('navigation');
  const tCommon = useTranslations('common');
  const direction = localeDirections[locale as Locale];
  const isRtl = direction === 'rtl';

  return (
    <>
      {/* Mobile sidebar (Sheet/Drawer) */}
      <div className="lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('fixed top-4 z-40', isRtl ? 'end-4' : 'start-4')}
              aria-label={t('openMenu')}
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side={isRtl ? 'right' : 'left'} className="w-64 p-0">
            <SheetHeader className="px-4 py-5 border-b">
              <SheetTitle className="text-2xl font-bold text-primary">
                {tCommon('appName')}
              </SheetTitle>
              <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col h-[calc(100%-73px)] overflow-y-auto pt-4">
              <SidebarNav onItemClick={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div
          className={cn('flex flex-col transition-all duration-300', collapsed ? 'w-16' : 'w-64')}
        >
          <div
            className={cn(
              'flex flex-col flex-grow bg-card border-border overflow-y-auto',
              isRtl ? 'border-s' : 'border-e',
            )}
          >
            <div className="flex items-center justify-between flex-shrink-0 px-4 py-5">
              {!collapsed && (
                <span className="text-2xl font-bold text-primary">{tCommon('appName')}</span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(!collapsed)}
                className={cn('h-8 w-8', collapsed && 'mx-auto')}
                aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
              >
                {collapsed ? (
                  isRtl ? (
                    <ChevronLeft className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )
                ) : isRtl ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
            <SidebarNav collapsed={collapsed} />
          </div>
        </div>
      </div>
    </>
  );
}
