'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useMemo } from 'react';

interface Permission {
  module: string;
  actions: string[];
}

/**
 * Hook to check user permissions based on role
 *
 * @example
 * const { hasPermission, hasAnyPermission, permissions } = usePermissions();
 *
 * // Check single permission
 * if (hasPermission('sales.create')) {
 *   // User can create sales records
 * }
 *
 * // Check if user has any of the permissions
 * if (hasAnyPermission(['sales.view', 'sales.export'])) {
 *   // User can view or export sales
 * }
 */
export function usePermissions() {
  const { data: session, status } = useSession();

  const permissions: Permission[] = useMemo(() => {
    const role = session?.user?.role as string | { permissions?: Permission[] } | undefined;
    if (typeof role === 'object' && role !== null) {
      return role.permissions || [];
    }
    return [];
  }, [session?.user?.role]);

  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';

  /**
   * Check if user has a specific permission
   * @param required - Permission string in format "module.action" (e.g., "sales.create")
   */
  const hasPermission = useCallback(
    (required: string): boolean => {
      if (!required || !isAuthenticated) return false;

      const [module, action] = required.split('.');
      if (!module || !action) return false;

      const permission = permissions.find((p) => p.module === module);
      return permission?.actions?.includes(action) ?? false;
    },
    [permissions, isAuthenticated],
  );

  /**
   * Check if user has any of the specified permissions
   * @param requiredPermissions - Array of permission strings
   */
  const hasAnyPermission = useCallback(
    (requiredPermissions: string[]): boolean => {
      return requiredPermissions.some((p) => hasPermission(p));
    },
    [hasPermission],
  );

  /**
   * Check if user has all of the specified permissions
   * @param requiredPermissions - Array of permission strings
   */
  const hasAllPermissions = useCallback(
    (requiredPermissions: string[]): boolean => {
      return requiredPermissions.every((p) => hasPermission(p));
    },
    [hasPermission],
  );

  /**
   * Check if user can access a module (has any action on it)
   * @param moduleName - Module name (e.g., "sales")
   */
  const canAccessModule = useCallback(
    (moduleName: string): boolean => {
      return permissions.some((p) => p.module === moduleName && p.actions.length > 0);
    },
    [permissions],
  );

  /**
   * Get all actions available for a module
   * @param moduleName - Module name
   */
  const getModuleActions = useCallback(
    (moduleName: string): string[] => {
      const permission = permissions.find((p) => p.module === moduleName);
      return permission?.actions || [];
    },
    [permissions],
  );

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessModule,
    getModuleActions,
    isLoading,
    isAuthenticated,
    role: session?.user?.role,
  };
}

/**
 * Available modules in the system
 */
export const MODULES = [
  'accounting',
  'sales',
  'purchases',
  'inventory',
  'banking',
  'hr',
  'manufacturing',
  'projects',
  'tax',
  'reports',
  'crm',
  'settings',
  'users',
] as const;

/**
 * Available actions
 */
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;

export type Module = (typeof MODULES)[number];
export type Action = (typeof ACTIONS)[number];

/**
 * Convenience hook that returns boolean flags for common CRUD permissions on a module.
 *
 * @example
 * const { canView, canCreate, canEdit, canDelete } = useModulePermissions('sales');
 * if (canCreate) { ... }
 */
export function useModulePermissions(module: string) {
  const { hasPermission, isLoading } = usePermissions();

  return {
    canView: hasPermission(`${module}.view`),
    canCreate: hasPermission(`${module}.create`),
    canEdit: hasPermission(`${module}.edit`),
    canDelete: hasPermission(`${module}.delete`),
    canExport: hasPermission(`${module}.export`),
    isLoading,
  };
}
