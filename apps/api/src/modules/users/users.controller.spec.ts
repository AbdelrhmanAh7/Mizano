/** The admin-only route that hands a member a password reset link (#599). */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UsersController } from './users.controller';

describe('UsersController reset link', () => {
  const createLinkForMember = jest.fn(() =>
    Promise.resolve({ link: 'https://app/en/reset-password#token=x', expiresAt: 'later' }),
  );
  const controller = new UsersController({} as never, { createLinkForMember } as never);

  it('needs settings.edit, like editing a member', () => {
    const required = Reflect.getMetadata(
      PERMISSIONS_KEY,
      UsersController.prototype.createResetLink,
    );
    expect(required).toEqual(['settings.edit']);
  });

  it('refuses a role without settings.edit', async () => {
    const prisma = {
      role: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            name: 'Accountant',
            permissions: [{ module: 'settings', actions: ['view'] }],
          }),
        ),
      },
    };
    const guard = new PermissionsGuard(new Reflector(), prisma as never);
    const context = {
      getHandler: () => UsersController.prototype.createResetLink,
      getClass: () => UsersController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u2', roleId: 'r2' } }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the link to the caller organization and falls back to the request language', async () => {
    await controller.createResetLink('org-1', { id: 'u1' } as never, 'm1', {}, {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    } as never);
    expect(createLinkForMember).toHaveBeenCalledWith('org-1', 'u1', 'm1', 'en');
  });
});
