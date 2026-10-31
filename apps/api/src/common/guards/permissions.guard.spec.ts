import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AnyPermission, Permissions } from '../decorators/permissions.decorator';
import { BillsController } from '../../modules/purchases/controllers/bills.controller';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let mockPrisma: any;

  beforeEach(() => {
    reflector = new Reflector();
    mockPrisma = {
      role: {
        findUnique: jest.fn(),
      },
    };
    guard = new PermissionsGuard(reflector, mockPrisma);
  });

  function createMockContext(
    user: any = { roleId: 'role-1' },
    handler: any = () => {},
    classRef: any = class {},
  ) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => handler,
      getClass: () => classRef,
    } as any;
  }

  it('should allow when no permissions required', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const context = createMockContext();
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should allow when permissions array is empty', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = createMockContext();
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should throw when user has no roleId', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.view']);
    const context = createMockContext({ id: 'user-1' });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should throw when user is null', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.view']);
    const context = createMockContext(null);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should throw when role not found', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.view']);
    mockPrisma.role.findUnique.mockResolvedValue(null);
    const context = createMockContext({ roleId: 'nonexistent' });
    await expect(guard.canActivate(context)).rejects.toThrow('Role not found');
  });

  it('should allow Admin role to bypass all permissions', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.view', 'sales.create']);
    mockPrisma.role.findUnique.mockResolvedValue({
      name: 'Admin',
      permissions: [],
    });
    const context = createMockContext({ roleId: 'admin-role' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should allow when user has required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.view']);
    mockPrisma.role.findUnique.mockResolvedValue({
      name: 'Sales Rep',
      permissions: [{ module: 'sales', actions: ['view', 'create'] }],
    });
    const context = createMockContext({ roleId: 'sales-role' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should throw when user lacks required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.delete']);
    mockPrisma.role.findUnique.mockResolvedValue({
      name: 'Sales Rep',
      permissions: [{ module: 'sales', actions: ['view', 'create'] }],
    });
    const context = createMockContext({ roleId: 'sales-role' });
    await expect(guard.canActivate(context)).rejects.toThrow('Missing permission: sales.delete');
  });

  it('should check all required permissions', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.view', 'inventory.view']);
    mockPrisma.role.findUnique.mockResolvedValue({
      name: 'Sales Rep',
      permissions: [
        { module: 'sales', actions: ['view', 'create'] },
        // Missing inventory permission
      ],
    });
    const context = createMockContext({ roleId: 'sales-role' });
    await expect(guard.canActivate(context)).rejects.toThrow('Missing permission: inventory.view');
  });

  it('should handle multiple module permissions correctly', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales.view', 'inventory.view']);
    mockPrisma.role.findUnique.mockResolvedValue({
      name: 'Manager',
      permissions: [
        { module: 'sales', actions: ['view', 'create', 'edit'] },
        { module: 'inventory', actions: ['view'] },
      ],
    });
    const context = createMockContext({ roleId: 'manager-role' });
    expect(await guard.canActivate(context)).toBe(true);
  });
  describe('@AnyPermission (one of)', () => {
    class Routes {
      @AnyPermission('purchases.create', 'purchases.edit')
      anyOf(): void {}

      @Permissions('purchases.view')
      @AnyPermission('purchases.create', 'purchases.edit')
      allAndAny(): void {}
    }
    const roleWith = (actions: string[]) =>
      mockPrisma.role.findUnique.mockResolvedValue({
        name: 'Custom',
        permissions: [{ module: 'purchases', actions }],
      });

    it('passes a role holding either permission and refuses one holding neither', async () => {
      roleWith(['edit']); // edit-only: may open a draft bill for editing
      await expect(
        guard.canActivate(createMockContext(undefined, Routes.prototype.anyOf, Routes)),
      ).resolves.toBe(true);

      roleWith(['create']);
      await expect(
        guard.canActivate(createMockContext({ roleId: 'role-2' }, Routes.prototype.anyOf, Routes)),
      ).resolves.toBe(true);

      roleWith(['view', 'delete']);
      await expect(
        guard.canActivate(createMockContext({ roleId: 'role-3' }, Routes.prototype.anyOf, Routes)),
      ).rejects.toThrow('Missing permission: one of purchases.create, purchases.edit');
    });

    it('still requires every @Permissions entry next to @AnyPermission', async () => {
      roleWith(['edit']);
      await expect(
        guard.canActivate(createMockContext(undefined, Routes.prototype.allAndAny, Routes)),
      ).rejects.toThrow('Missing permission: purchases.view');
    });

    it('lets edit-only roles load the bill form account options', async () => {
      roleWith(['edit']);
      await expect(
        guard.canActivate(
          createMockContext(undefined, BillsController.prototype.accountOptions, BillsController),
        ),
      ).resolves.toBe(true);
    });
  });
});
