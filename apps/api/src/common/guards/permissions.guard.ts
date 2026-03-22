import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

interface CachedRole {
  name: string;
  permissions: { module: string; actions: string[] }[];
  cachedAt: number;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  private roleCache = new Map<string, CachedRole>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roleId) {
      throw new ForbiddenException('Access denied');
    }

    const role = await this.getCachedRole(user.roleId);

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

  private async getCachedRole(roleId: string): Promise<CachedRole | null> {
    const cached = this.roleCache.get(roleId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      return cached;
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });

    if (!role) return null;

    const entry: CachedRole = {
      name: role.name,
      permissions: role.permissions.map((p) => ({
        module: p.module,
        actions: p.actions,
      })),
      cachedAt: Date.now(),
    };

    this.roleCache.set(roleId, entry);

    // Evict stale entries periodically (keep cache bounded)
    if (this.roleCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of this.roleCache) {
        if (now - value.cachedAt > this.CACHE_TTL) {
          this.roleCache.delete(key);
        }
      }
    }

    return entry;
  }
}
