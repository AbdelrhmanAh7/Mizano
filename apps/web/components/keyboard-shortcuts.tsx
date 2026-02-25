'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGlobalShortcutListener, useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import { modifierSymbol, useShortcutRegistry } from '@/lib/stores/use-shortcut-registry';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

/** Map of route segments to their "new" route */
const NEW_ROUTES: Record<string, string> = {
  invoices: '/sales/invoices/new',
  customers: '/sales/customers/new',
  quotes: '/sales/quotes/new',
  'credit-notes': '/sales/credit-notes/new',
  vendors: '/purchases/vendors/new',
  bills: '/purchases/bills/new',
  expenses: '/purchases/expenses/new',
  accounts: '/accounting/accounts/new',
  journals: '/accounting/journals/new',
  items: '/inventory/items/new',
  employees: '/hr/employees/new',
  leads: '/crm/leads/new',
  deals: '/crm/deals/new',
  projects: '/projects/new',
};

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();

  // Activate the global listener that processes the shortcut registry
  useGlobalShortcutListener();

  const nav = (href: string) => router.push(`/${locale}${href}`);

  // --- General shortcuts ---
  useKeyboardShortcut({
    id: 'show-help',
    keys: ['?'],
    description: 'Show keyboard shortcuts',
    category: 'general',
    handler: () => setShowHelp(true),
  });

  useKeyboardShortcut({
    id: 'focus-search',
    keys: ['/'],
    description: 'Focus search / Open command palette',
    category: 'general',
    handler: () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
      );
    },
  });

  // --- Context-sensitive N shortcut ---
  const newRoute = useMemo(() => {
    // Extract the last meaningful path segment
    const segments = pathname.replace(`/${locale}`, '').split('/').filter(Boolean);
    // Walk backwards to find a matching segment
    for (let i = segments.length - 1; i >= 0; i--) {
      if (NEW_ROUTES[segments[i]]) return NEW_ROUTES[segments[i]];
    }
    return null;
  }, [pathname, locale]);

  useKeyboardShortcut({
    id: 'new-item',
    keys: ['n'],
    description: 'New item (context-dependent)',
    category: 'actions',
    handler: () => {
      if (newRoute) nav(newRoute);
    },
    disabled: !newRoute,
  });

  // --- G+key navigation combos ---
  useKeyboardShortcut({
    id: 'goto-dashboard',
    keys: ['g', 'd'],
    description: 'Go to Dashboard',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/dashboard'),
  });

  useKeyboardShortcut({
    id: 'goto-invoices',
    keys: ['g', 'i'],
    description: 'Go to Invoices',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/sales/invoices'),
  });

  useKeyboardShortcut({
    id: 'goto-customers',
    keys: ['g', 'c'],
    description: 'Go to Customers',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/sales/customers'),
  });

  useKeyboardShortcut({
    id: 'goto-expenses',
    keys: ['g', 'e'],
    description: 'Go to Expenses',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/purchases/expenses'),
  });

  useKeyboardShortcut({
    id: 'goto-bills',
    keys: ['g', 'b'],
    description: 'Go to Bills',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/purchases/bills'),
  });

  useKeyboardShortcut({
    id: 'goto-vendors',
    keys: ['g', 'v'],
    description: 'Go to Vendors',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/purchases/vendors'),
  });

  useKeyboardShortcut({
    id: 'goto-accounts',
    keys: ['g', 'a'],
    description: 'Go to Chart of Accounts',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/accounting/accounts'),
  });

  useKeyboardShortcut({
    id: 'goto-reports',
    keys: ['g', 'r'],
    description: 'Go to Reports',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/reports'),
  });

  useKeyboardShortcut({
    id: 'goto-projects',
    keys: ['g', 'p'],
    description: 'Go to Projects',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/projects'),
  });

  useKeyboardShortcut({
    id: 'goto-settings',
    keys: ['g', 's'],
    description: 'Go to Settings',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/settings'),
  });

  useKeyboardShortcut({
    id: 'goto-leads',
    keys: ['g', 'l'],
    description: 'Go to Leads',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/crm/leads'),
  });

  useKeyboardShortcut({
    id: 'goto-items',
    keys: ['g', 'n'],
    description: 'Go to Inventory Items',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/inventory/items'),
  });

  useKeyboardShortcut({
    id: 'goto-journals',
    keys: ['g', 'j'],
    description: 'Go to Journal Entries',
    category: 'navigation',
    isSequence: true,
    handler: () => nav('/accounting/journals'),
  });

  // Build display list from registry
  const allShortcuts = useShortcutRegistry((s) => s.getAll());

  const displayShortcuts = useMemo(() => {
    // Static display list for help dialog — ordered logically
    return [
      { keys: [modifierSymbol, 'K'], description: 'Open command palette' },
      { keys: ['N'], description: 'New item (context-dependent)' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close dialog / panel' },
      // Navigation
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'I'], description: 'Go to Invoices' },
      { keys: ['G', 'C'], description: 'Go to Customers' },
      { keys: ['G', 'E'], description: 'Go to Expenses' },
      { keys: ['G', 'B'], description: 'Go to Bills' },
      { keys: ['G', 'V'], description: 'Go to Vendors' },
      { keys: ['G', 'A'], description: 'Go to Accounts' },
      { keys: ['G', 'R'], description: 'Go to Reports' },
      { keys: ['G', 'P'], description: 'Go to Projects' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
      { keys: ['G', 'L'], description: 'Go to Leads' },
      { keys: ['G', 'N'], description: 'Go to Inventory' },
      { keys: ['G', 'J'], description: 'Go to Journals' },
    ];
  }, []);

  return (
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Quick actions to navigate faster</DialogDescription>
        </DialogHeader>

        {/* General */}
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
            General
          </h4>
          {displayShortcuts.slice(0, 5).map((shortcut) => (
            <ShortcutRow key={shortcut.description} {...shortcut} />
          ))}
        </div>

        {/* Navigation */}
        <div className="space-y-0.5 mt-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
            Navigation
          </h4>
          {displayShortcuts.slice(5).map((shortcut) => (
            <ShortcutRow key={shortcut.description} {...shortcut} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1">
      <span className="text-sm text-muted-foreground">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs font-medium">
              {key}
            </kbd>
            {i < keys.length - 1 && <span className="text-muted-foreground mx-0.5 text-xs">+</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
