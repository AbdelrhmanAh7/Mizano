'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  useClearSearchHistory,
  useGlobalSearch,
  useRecordSearchHistory,
  useSearchHistory,
} from '@/lib/hooks/use-global-search';
import { useRecentStore } from '@/lib/stores/use-recent-store';
import { useSearchHistoryStore } from '@/lib/stores/use-search-history-store';
import {
  AlertCircle,
  BarChart3,
  Brain,
  Briefcase,
  Building2,
  Calculator,
  Clock,
  DollarSign,
  Factory,
  FileText,
  FlaskConical,
  History,
  Landmark,
  LayoutDashboard,
  Loader2,
  Package,
  Percent,
  Plus,
  Receipt,
  Search,
  Settings,
  Target,
  Trash2,
  UserCircle,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SearchResult } from '@/lib/hooks/use-global-search';

interface CommandItemDef {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
}

const SEARCH_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  customer: Users,
  vendor: Building2,
  invoice: Receipt,
  bill: FileText,
  item: Package,
  employee: UserCircle,
  project: Briefcase,
  lead: Target,
  deal: Target,
  quote: FileText,
  expense: Receipt,
};

const ENTITY_TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'customer', label: 'Customers' },
  { key: 'vendor', label: 'Vendors' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'bill', label: 'Bills' },
  { key: 'item', label: 'Items' },
  { key: 'employee', label: 'Employees' },
  { key: 'project', label: 'Projects' },
  { key: 'lead', label: 'Leads' },
  { key: 'deal', label: 'Deals' },
  { key: 'quote', label: 'Quotes' },
  { key: 'expense', label: 'Expenses' },
] as const;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay]);
  return debounced;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('navigation');
  const tc = useTranslations('common');
  const recentPages = useRecentStore((s) => s.recentPages);
  const addPage = useRecentStore((s) => s.addPage);

  // Search history stores
  const localSearchHistory = useSearchHistoryStore((s) => s.recentSearches);
  const addLocalSearch = useSearchHistoryStore((s) => s.addSearch);
  const clearLocalSearches = useSearchHistoryStore((s) => s.clearSearches);
  const syncFromServer = useSearchHistoryStore((s) => s.syncFromServer);

  const debouncedQuery = useDebouncedValue(inputValue, 300);

  // Determine types filter for API call
  const searchTypes = activeFilter !== 'all' ? [activeFilter] : undefined;

  const {
    data: searchData,
    isFetching: isSearching,
    isError: isSearchError,
  } = useGlobalSearch(debouncedQuery, { types: searchTypes });

  // Search history from server
  const { data: serverHistory } = useSearchHistory();
  const recordHistoryMutation = useRecordSearchHistory();
  const clearHistoryMutation = useClearSearchHistory();

  // Sync server history to local store when it loads
  useEffect(() => {
    if (serverHistory?.data) {
      syncFromServer(
        serverHistory.data.map((h) => ({
          query: h.query,
          resultType: h.resultType ?? undefined,
          resultId: h.resultId ?? undefined,
          resultTitle: h.resultTitle ?? undefined,
          clickedAt: new Date(h.clickedAt).getTime(),
        })),
      );
    }
  }, [serverHistory, syncFromServer]);

  // Reset input and filter when dialog closes
  useEffect(() => {
    if (!open) {
      setInputValue('');
      setActiveFilter('all');
    }
  }, [open]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const navigate = useCallback(
    (href: string, label?: string) => {
      setOpen(false);
      const fullPath = `/${locale}${href}`;
      router.push(fullPath);
      // Track in recent pages
      if (label) {
        addPage({ href, label });
      }
    },
    [locale, router, addPage],
  );

  const handleSearchResultClick = useCallback(
    (result: SearchResult) => {
      // Record to local + server history
      addLocalSearch({
        query: debouncedQuery,
        resultType: result.type,
        resultId: result.id,
        resultTitle: result.title,
      });
      recordHistoryMutation.mutate({
        query: debouncedQuery,
        resultType: result.type,
        resultId: result.id,
        resultTitle: result.title,
      });

      navigate(result.href, result.title);
    },
    [debouncedQuery, addLocalSearch, recordHistoryMutation, navigate],
  );

  const handleClearHistory = useCallback(() => {
    clearLocalSearches();
    clearHistoryMutation.mutate();
  }, [clearLocalSearches, clearHistoryMutation]);

  const handleHistoryItemClick = useCallback(
    (entry: { query: string; resultType?: string; resultId?: string; resultTitle?: string }) => {
      if (entry.resultId && entry.resultType) {
        // Navigate to the specific result
        const hrefPrefix = getHrefPrefix(entry.resultType);
        if (hrefPrefix) {
          navigate(`${hrefPrefix}${entry.resultId}`, entry.resultTitle);
          return;
        }
      }
      // Otherwise, populate the search input with the historical query
      setInputValue(entry.query);
    },
    [navigate],
  );

  const navigationItems: CommandItemDef[] = useMemo(
    () => [
      { label: t('dashboard'), href: '/dashboard', icon: LayoutDashboard },
      { label: t('sales.customers'), href: '/sales/customers', icon: Users, keywords: 'clients' },
      {
        label: t('sales.invoices'),
        href: '/sales/invoices',
        icon: Receipt,
        keywords: 'billing',
      },
      {
        label: t('sales.quotes'),
        href: '/sales/quotes',
        icon: FileText,
        keywords: 'estimates',
      },
      { label: t('sales.creditNotes'), href: '/sales/credit-notes', icon: FileText },
      { label: t('sales.payments'), href: '/sales/payments', icon: DollarSign },
      {
        label: t('purchases.vendors'),
        href: '/purchases/vendors',
        icon: Building2,
        keywords: 'suppliers',
      },
      { label: t('purchases.bills'), href: '/purchases/bills', icon: FileText },
      { label: t('purchases.expenses'), href: '/purchases/expenses', icon: Receipt },
      { label: t('accounting.chartOfAccounts'), href: '/accounting/accounts', icon: Calculator },
      { label: t('accounting.journalEntries'), href: '/accounting/journals', icon: FileText },
      {
        label: t('inventory.items.title'),
        href: '/inventory/items',
        icon: Package,
        keywords: 'products stock',
      },
      { label: t('banking.accounts.title'), href: '/banking/accounts', icon: Landmark },
      { label: t('projects.title'), href: '/projects', icon: Briefcase },
      { label: t('hr.employees.title'), href: '/hr/employees', icon: UserCircle },
      { label: t('manufacturing.bom'), href: '/manufacturing/bom', icon: Factory },
      { label: t('crm.leads'), href: '/crm/leads', icon: Target, keywords: 'prospects' },
      {
        label: t('crm.deals'),
        href: '/crm/deals',
        icon: Target,
        keywords: 'opportunities pipeline',
      },
      { label: t('tax.vatReturns'), href: '/tax/returns', icon: Percent },
      { label: t('reports'), href: '/reports', icon: BarChart3 },
      { label: t('aiInsights'), href: '/ai-insights', icon: Brain },
      { label: t('aiLab'), href: '/ai-lab', icon: FlaskConical },
      { label: t('settings'), href: '/settings', icon: Settings },
    ],
    [t],
  );

  const quickActions: CommandItemDef[] = useMemo(
    () => [
      {
        label: 'New Invoice',
        href: '/sales/invoices/new',
        icon: Plus,
        keywords: 'create invoice billing',
      },
      {
        label: 'New Customer',
        href: '/sales/customers/new',
        icon: Plus,
        keywords: 'create customer client',
      },
      {
        label: 'New Quote',
        href: '/sales/quotes/new',
        icon: Plus,
        keywords: 'create quote estimate',
      },
      {
        label: 'New Expense',
        href: '/purchases/expenses/new',
        icon: Plus,
        keywords: 'create expense',
      },
      {
        label: 'New Bill',
        href: '/purchases/bills/new',
        icon: Plus,
        keywords: 'create bill',
      },
      {
        label: 'New Vendor',
        href: '/purchases/vendors/new',
        icon: Plus,
        keywords: 'create vendor supplier',
      },
      {
        label: 'New Journal Entry',
        href: '/accounting/journals/new',
        icon: Plus,
        keywords: 'create journal',
      },
      {
        label: 'New Item',
        href: '/inventory/items/new',
        icon: Plus,
        keywords: 'create item product',
      },
      {
        label: 'New Employee',
        href: '/hr/employees/new',
        icon: Plus,
        keywords: 'create employee',
      },
      {
        label: 'New Lead',
        href: '/crm/leads/new',
        icon: Plus,
        keywords: 'create lead prospect',
      },
      {
        label: 'New Deal',
        href: '/crm/deals/new',
        icon: Plus,
        keywords: 'create deal opportunity',
      },
      {
        label: 'New Project',
        href: '/projects/new',
        icon: Plus,
        keywords: 'create project',
      },
      {
        label: 'Scan Document',
        href: '/purchases/bills/scan',
        icon: Plus,
        keywords: 'ocr upload scan receipt',
      },
    ],
    [],
  );

  // Build icon lookup for recent pages
  const iconMap = useMemo(() => {
    const map = new Map<string, React.ComponentType<{ className?: string }>>();
    for (const item of [...navigationItems, ...quickActions]) {
      map.set(item.href, item.icon);
    }
    return map;
  }, [navigationItems, quickActions]);

  const hasSearchQuery = debouncedQuery.length >= 2;
  const hasSearchResults = searchData && searchData.groups && searchData.groups.length > 0;
  const showRecentSearches = !hasSearchQuery && localSearchHistory.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={tc('search.placeholder', { fallback: 'Type a command or search...' })}
        value={inputValue}
        onValueChange={setInputValue}
      />

      {/* Entity type filter chips — shown when a search query is active */}
      {hasSearchQuery && (
        <div className="flex flex-wrap gap-1 border-b px-3 py-2">
          {ENTITY_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                activeFilter === filter.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}

      <CommandList>
        <CommandEmpty>
          {isSearchError ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{tc('errors.generic')}</p>
              <p className="text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : hasSearchQuery ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Search className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No results found for &ldquo;{debouncedQuery}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground">
                Try a different search term or check for typos
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No results found.</p>
          )}
        </CommandEmpty>

        {/* Loading indicator */}
        {isSearching && hasSearchQuery && (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching...
          </div>
        )}

        {/* Search Results from API — grouped by entity type */}
        {hasSearchResults && (
          <>
            {searchData!.groups.map((group) => (
              <CommandGroup key={group.type} heading={group.label}>
                {group.results.map((result: SearchResult) => {
                  const Icon = SEARCH_TYPE_ICONS[result.type] || FileText;
                  return (
                    <CommandItem
                      key={`search-${result.id}`}
                      value={`search ${result.title} ${result.subtitle || ''}`}
                      onSelect={() => handleSearchResultClick(result)}
                    >
                      <Icon className="me-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        )}
                      </div>
                      {/* Relevance score indicator */}
                      <span
                        className="ms-auto shrink-0 text-[10px] text-muted-foreground/60"
                        title={`Relevance: ${Math.round(result.score * 100)}%`}
                      >
                        {Math.round(result.score * 100)}%
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            <CommandSeparator />
          </>
        )}

        {/* Recent Searches */}
        {showRecentSearches && (
          <>
            <CommandGroup heading="Recent Searches">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <History className="h-3 w-3" />
                  Recent
                </span>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
              {localSearchHistory.slice(0, 8).map((entry) => {
                const Icon = entry.resultType
                  ? SEARCH_TYPE_ICONS[entry.resultType] || Clock
                  : Clock;
                const display = entry.resultTitle ?? entry.query;
                return (
                  <CommandItem
                    key={`history-${entry.query}-${entry.clickedAt}`}
                    value={`history ${entry.query} ${display}`}
                    onSelect={() =>
                      handleHistoryItemClick({
                        query: entry.query,
                        resultType: entry.resultType,
                        resultId: entry.resultId,
                        resultTitle: entry.resultTitle,
                      })
                    }
                  >
                    <Icon className="me-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{display}</span>
                      {entry.resultTitle && (
                        <span className="truncate text-xs text-muted-foreground">
                          {entry.query}
                        </span>
                      )}
                    </div>
                    {entry.resultType && (
                      <span className="ms-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                        {entry.resultType}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Recent Pages */}
        {recentPages.length > 0 && !hasSearchQuery && (
          <>
            <CommandGroup heading="Recent">
              {recentPages.slice(0, 5).map((page) => {
                const Icon = iconMap.get(page.href) || Clock;
                return (
                  <CommandItem
                    key={`recent-${page.href}`}
                    value={`recent ${page.label}`}
                    onSelect={() => navigate(page.href, page.label)}
                  >
                    <Icon className="me-2 h-4 w-4 text-muted-foreground" />
                    {page.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Quick Actions">
          {quickActions.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.keywords || ''}`}
              onSelect={() => navigate(item.href, item.label)}
            >
              <item.icon className="me-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.keywords || ''}`}
              onSelect={() => navigate(item.href, item.label)}
            >
              <item.icon className="me-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

// ============================================
// Helpers
// ============================================

function getHrefPrefix(entityType: string): string | null {
  const prefixes: Record<string, string> = {
    customer: '/sales/customers/',
    vendor: '/purchases/vendors/',
    invoice: '/sales/invoices/',
    bill: '/purchases/bills/',
    item: '/inventory/items/',
    employee: '/hr/employees/',
    project: '/projects/',
    lead: '/crm/leads/',
    deal: '/crm/deals/',
    quote: '/sales/quotes/',
    expense: '/purchases/expenses/',
  };
  return prefixes[entityType] ?? null;
}
