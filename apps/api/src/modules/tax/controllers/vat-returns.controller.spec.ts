import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { VatReturnsController } from './vat-returns.controller';

describe('VAT submission permissions', () => {
  it('leaves all stored grants and omissions unchanged during the permission migration', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../../../prisma/migrations/20261005000000_grant_tax_submit/migration.sql',
      ),
      'utf8',
    );

    // Enforce a no-op migration: even a name/default-filtered backfill can escalate custom roles
    // or restore a revoked permission. No executable SQL means no stored permissions change.
    const executableSql = migration
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
      .trim();
    expect(executableSql).toBe('');
  });

  describe.each(['submit', 'fileReturn', 'bulkSubmit'] as const)('%s', (action) => {
    const reflector = new Reflector();
    const handler = VatReturnsController.prototype[action];
    const context = {
      getHandler: () => handler,
      getClass: () => VatReturnsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roleId: 'role-1', organizationId: 'org-1' } }),
      }),
    } as unknown as ExecutionContext;

    function guardForRole(name: string, isDefault: boolean, actions: string[]) {
      const prisma = {
        role: {
          findUnique: jest.fn().mockResolvedValue({
            name,
            isDefault,
            permissions: [{ module: 'tax', actions }],
          }),
        },
      } as unknown as PrismaService;
      return new PermissionsGuard(reflector, prisma);
    }

    it('requires the explicit tax.submit permission on the real controller route', () => {
      expect(reflector.getAllAndOverride(PERMISSIONS_KEY, [handler, VatReturnsController])).toEqual(
        ['tax.submit'],
      );
    });

    it.each([
      { name: 'Custom tax editor', isDefault: false },
      { name: 'Accountant', isDefault: false },
      { name: 'Accountant', isDefault: true },
      { name: 'Renamed seeded role', isDefault: true },
    ])('denies tax.edit alone for $name (isDefault=$isDefault)', async ({ name, isDefault }) => {
      const guard = guardForRole(name, isDefault, ['view', 'edit']);
      const authorization = guard.canActivate(context);
      await expect(authorization).rejects.toThrow(ForbiddenException);
      await expect(authorization).rejects.toThrow('Missing permission: tax.submit');
    });

    it('preserves access for a custom role explicitly granted submit without edit', async () => {
      const guard = guardForRole('Custom tax submitter', false, ['submit']);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
