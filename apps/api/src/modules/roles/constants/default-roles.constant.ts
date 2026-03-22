/**
 * Default roles and permissions for Mizano ERP
 *
 * Permission Format: { module: string, actions: string[] }
 * Actions: view, create, edit, delete, export
 *
 * These roles are seeded when a new organization is created
 * or can be manually seeded via the seed endpoint.
 */
export interface RolePermission {
  module: string;
  actions: string[];
}

export interface DefaultRole {
  name: string;
  description: string;
  isDefault?: boolean;
  permissions: RolePermission[];
}

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: 'Admin',
    description: 'Full system access - can manage all modules and settings',
    isDefault: true,
    permissions: [
      { module: 'accounting', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'sales', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'purchases', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'banking', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'hr', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'manufacturing', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'projects', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'tax', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'reports', actions: ['view', 'export'] },
      { module: 'crm', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'settings', actions: ['view', 'create', 'edit', 'delete'] },
      { module: 'users', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    name: 'Manager',
    description: 'Can manage most modules except system settings and user deletion',
    permissions: [
      { module: 'accounting', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'sales', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'purchases', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'banking', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'hr', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'manufacturing', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'projects', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'tax', actions: ['view', 'export'] },
      { module: 'reports', actions: ['view', 'export'] },
      { module: 'crm', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'settings', actions: ['view'] },
      { module: 'users', actions: ['view'] },
    ],
  },
  {
    name: 'Accountant',
    description: 'Full access to accounting, banking, tax, and reports',
    permissions: [
      { module: 'accounting', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'sales', actions: ['view', 'export'] },
      { module: 'purchases', actions: ['view', 'export'] },
      { module: 'banking', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'tax', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'reports', actions: ['view', 'export'] },
      { module: 'hr', actions: ['view'] },
    ],
  },
  {
    name: 'SalesRep',
    description: 'Manage customers, quotes, invoices, and CRM activities',
    permissions: [
      { module: 'sales', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'crm', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'projects', actions: ['view'] },
      { module: 'inventory', actions: ['view'] },
      { module: 'reports', actions: ['view'] },
    ],
  },
  {
    name: 'StoreKeeper',
    description: 'Manage inventory, warehouses, and stock movements',
    permissions: [
      { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'manufacturing', actions: ['view', 'create', 'edit'] },
      { module: 'purchases', actions: ['view'] },
      { module: 'sales', actions: ['view'] },
    ],
  },
];

/**
 * All available modules in the system
 */
export const AVAILABLE_MODULES = [
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
 * All available actions
 */
export const AVAILABLE_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;

export type AvailableModule = (typeof AVAILABLE_MODULES)[number];
export type AvailableAction = (typeof AVAILABLE_ACTIONS)[number];
