import type { Prisma } from '@prisma/client';
import { systemName } from '../../common/i18n/localize';
import { DEFAULT_ROLES } from './constants/default-roles.constant';

/**
 * Creates the standard roles (Admin, Manager, Accountant, SalesRep, StoreKeeper) an organization
 * does not have yet, with their permissions. Used at sign-up and by "Add standard roles", so a new
 * organization can give its accountant the Accountant role from the first day.
 */
export async function createMissingDefaultRoles(
  db: Pick<Prisma.TransactionClient, 'role'>,
  organizationId: string,
): Promise<Array<{ id: string; name: string; created: boolean }>> {
  const result: Array<{ id: string; name: string; created: boolean }> = [];
  for (const roleData of DEFAULT_ROLES) {
    const existing = await db.role.findFirst({
      where: { name: roleData.name, organizationId },
      select: { id: true },
    });
    if (existing) {
      result.push({ id: existing.id, name: roleData.name, created: false });
      continue;
    }
    const role = await db.role.create({
      data: {
        ...systemName(roleData.name),
        description: roleData.description,
        isDefault: roleData.isDefault || false,
        organizationId,
        permissions: {
          create: roleData.permissions.map((p) => ({ module: p.module, actions: p.actions })),
        },
      },
      select: { id: true },
    });
    result.push({ id: role.id, name: roleData.name, created: true });
  }
  return result;
}
