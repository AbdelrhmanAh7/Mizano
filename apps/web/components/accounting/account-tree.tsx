'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Account,
  AccountType,
  getAccountTypeColor,
  useAccountTypeLabel,
} from '@/lib/hooks/use-accounts';

interface AccountTreeNodeProps {
  account: Account;
  level: number;
  onEdit?: (account: Account) => void;
  onDelete?: (account: Account) => void;
  onAddChild?: (parentAccount: Account) => void;
}

function AccountTreeNode({ account, level, onEdit, onDelete, onAddChild }: AccountTreeNodeProps) {
  const typeLabel = useAccountTypeLabel();
  const t = useTranslations('accounting.accounts.page');
  const tTree = useTranslations('accounting.accounts.tree');
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = account.children && account.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center justify-between py-2 px-3 hover:bg-muted/50 rounded-md group',
          level > 0 && 'ms-6',
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Expand/Collapse button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn('p-0.5 hover:bg-muted rounded', !hasChildren && 'invisible')}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-label={tTree(isExpanded ? 'collapse' : 'expand', { name: account.name })}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
            )}
          </button>

          {/* Account code */}
          <span className="font-mono text-sm text-muted-foreground w-16">{account.code}</span>

          {/* Account name */}
          <span className="font-medium truncate">{account.name}</span>

          {/* Account type badge */}
          <Badge variant="secondary" className={cn('text-xs', getAccountTypeColor(account.type))}>
            {typeLabel(account.type)}
          </Badge>

          {/* System account indicator */}
          {account.isSystem && (
            <Badge variant="outline" className="text-xs">
              {t('system')}
            </Badge>
          )}

          {/* Inactive indicator */}
          {!account.isActive && (
            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
              {tTree('inactive')}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label={tTree('actions', { name: account.name })}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onAddChild && (
                <DropdownMenuItem onClick={() => onAddChild(account)}>
                  <Plus className="me-2 h-4 w-4" />
                  {tTree('addChild')}
                </DropdownMenuItem>
              )}
              {onEdit && !account.isSystem && (
                <DropdownMenuItem onClick={() => onEdit(account)}>
                  <Edit className="me-2 h-4 w-4" />
                  {tTree('edit')}
                </DropdownMenuItem>
              )}
              {onDelete && !account.isSystem && (
                <DropdownMenuItem
                  onClick={() => onDelete(account)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="me-2 h-4 w-4" />
                  {tTree('delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="border-s border-muted ms-5">
          {account.children!.map((child) => (
            <AccountTreeNode
              key={child.id}
              account={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface AccountTreeProps {
  accounts: Account[];
  onEdit?: (account: Account) => void;
  onDelete?: (account: Account) => void;
  onAddChild?: (parentAccount: Account) => void;
  isLoading?: boolean;
}

export function AccountTree({
  accounts,
  onEdit,
  onDelete,
  onAddChild,
  isLoading,
}: AccountTreeProps) {
  const typeLabel = useAccountTypeLabel();
  const tPage = useTranslations('accounting.accounts.page');
  const tTree = useTranslations('accounting.accounts.tree');
  // Group accounts by type
  const groupedAccounts = accounts.reduce(
    (acc, account) => {
      const type = account.type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(account);
      return acc;
    },
    {} as Record<AccountType, Account[]>,
  );

  const typeOrder: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'REVENUE', 'EXPENSE'];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{tTree('emptyTitle')}</p>
        <p className="text-sm mt-1">{tTree('emptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {typeOrder.map((type) => {
        const typeAccounts = groupedAccounts[type];
        if (!typeAccounts || typeAccounts.length === 0) return null;

        return (
          <div key={type}>
            <h3
              className={cn(
                'text-sm font-semibold mb-2 px-3 py-1 rounded-md',
                getAccountTypeColor(type),
              )}
            >
              {tPage('groupTitle', { type: typeLabel(type) })}
            </h3>
            <div className="space-y-0.5">
              {typeAccounts.map((account) => (
                <AccountTreeNode
                  key={account.id}
                  account={account}
                  level={0}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddChild={onAddChild}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
