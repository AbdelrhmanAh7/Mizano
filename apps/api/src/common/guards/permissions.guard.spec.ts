import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

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
});
