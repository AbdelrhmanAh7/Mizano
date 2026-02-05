'use client';

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
import { Account, AccountType, getAccountTypeColor, getAccountTypeLabel } from '@/lib/hooks/use-accounts';

interface AccountTreeNodeProps {
  account: Account;
  level: number;
  onEdit?: (account: Account) => void;
  onDelete?: (account: Account) => void;
  onAddChild?: (parentAccount: Account) => void;
}

function AccountTreeNode({ account, level, onEdit, onDelete, onAddChild }: AccountTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = account.children && account.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center justify-between py-2 px-3 hover:bg-muted/50 rounded-md group',
          level > 0 && 'ml-6'
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Expand/Collapse button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'p-0.5 hover:bg-muted rounded',
              !hasChildren && 'invisible'
            )}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {/* Account code */}
          <span className="font-mono text-sm text-muted-foreground w-16">
            {account.code}
          </span>

          {/* Account name */}
          <span className="font-medium truncate">{account.name}</span>

          {/* Account type badge */}
          <Badge variant="secondary" className={cn('text-xs', getAccountTypeColor(account.type))}>
            {getAccountTypeLabel(account.type)}
          </Badge>

          {/* System account indicator */}
          {account.isSystem && (
            <Badge variant="outline" className="text-xs">
              System
            </Badge>
          )}

          {/* Inactive indicator */}
          {!account.isActive && (
            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
              Inactive
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onAddChild && (
                <DropdownMenuItem onClick={() => onAddChild(account)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Child Account
                </DropdownMenuItem>
              )}
              {onEdit && !account.isSystem && (
                <DropdownMenuItem onClick={() => onEdit(account)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && !account.isSystem && (
                <DropdownMenuItem
                  onClick={() => onDelete(account)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="border-l border-muted ml-5">
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
  // Group accounts by type
  const groupedAccounts = accounts.reduce((acc, account) => {
    const type = account.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(account);
    return acc;
  }, {} as Record<AccountType, Account[]>);

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
        <p>No accounts found.</p>
        <p className="text-sm mt-1">Create your first account or seed default accounts to get started.</p>
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
            <h3 className={cn(
              'text-sm font-semibold mb-2 px-3 py-1 rounded-md',
              getAccountTypeColor(type)
            )}>
              {getAccountTypeLabel(type)} Accounts
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
