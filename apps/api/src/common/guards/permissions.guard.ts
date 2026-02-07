import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roleId) {
      throw new ForbiddenException('Access denied');
    }

    // Get user's role with permissions
    const role = await this.prisma.role.findUnique({
      where: { id: user.roleId },
      include: { permissions: true },
    });

    if (!role) {
      throw new ForbiddenException('Role not found');
    }

    // Admin role bypasses all permission checks
    if (role.name === 'Admin') {
      return true;
    }

    // Check if user has all required permissions
    for (const required of requiredPermissions) {
      const [module, action] = required.split('.');
      const permission = role.permissions.find((p) => p.module === module);

      if (!permission || !permission.actions.includes(action)) {
        throw new ForbiddenException(`Missing permission: ${required}`);
      }
    }

    return true;
  }
}
