'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface CanProps {
  /**
   * Single permission to check (e.g., "sales.create")
   */
  permission?: string;
  /**
   * Multiple permissions - user must have ANY of these
   */
  anyOf?: string[];
  /**
   * Multiple permissions - user must have ALL of these
   */
  allOf?: string[];
  /**
   * Content to render if user has permission
   */
  children: ReactNode;
  /**
   * Content to render if user lacks permission
   */
  fallback?: ReactNode;
}

/**
 * Permission gate component - conditionally renders children based on user permissions
 *
 * @example
 * // Single permission check
 * <Can permission="sales.create">
 *   <CreateInvoiceButton />
 * </Can>
 *
 * @example
 * // Check any of multiple permissions
 * <Can anyOf={["sales.view", "sales.export"]}>
 *   <ViewSalesReport />
 * </Can>
 *
 * @example
 * // Check all permissions required
 * <Can allOf={["settings.view", "users.edit"]} fallback={<AccessDenied />}>
 *   <UserManagement />
 * </Can>
 */
export function Can({ permission, anyOf, allOf, children, fallback = null }: CanProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions();

  // While loading, don't render anything (or render fallback)
  if (isLoading) {
    return <>{fallback}</>;
  }

  // Check single permission
  if (permission) {
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }

  // Check any of multiple permissions
  if (anyOf && anyOf.length > 0) {
    return hasAnyPermission(anyOf) ? <>{children}</> : <>{fallback}</>;
  }

  // Check all permissions
  if (allOf && allOf.length > 0) {
    return hasAllPermissions(allOf) ? <>{children}</> : <>{fallback}</>;
  }

  // No permission specified, render children by default
  return <>{children}</>;
}

/**
 * Inverse of Can - renders children only when user LACKS permission
 */
interface CannotProps {
  permission: string;
  children: ReactNode;
}

export function Cannot({ permission, children }: CannotProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  return !hasPermission(permission) ? <>{children}</> : null;
}

/**
 * Higher-order component to wrap components with permission check
 */
export function withPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  permission: string,
  FallbackComponent?: React.ComponentType
) {
  return function PermissionGate(props: P) {
    const { hasPermission, isLoading } = usePermissions();

    if (isLoading) {
      return FallbackComponent ? <FallbackComponent /> : null;
    }

    if (!hasPermission(permission)) {
      return FallbackComponent ? <FallbackComponent /> : null;
    }

    return <WrappedComponent {...props} />;
  };
}
