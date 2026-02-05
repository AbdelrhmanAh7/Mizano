import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * OrganizationGuard ensures that users can only access resources
 * within their own organization. This is a critical multi-tenancy
 * security measure to prevent data leakage across organizations.
 *
 * Usage:
 * - Add @UseGuards(JwtAuthGuard, OrganizationGuard) to controllers
 * - The guard checks organizationId from params, query, or body
 * - If no organizationId is specified, it allows (uses user's org via @CurrentOrg)
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user (shouldn't happen with JwtAuthGuard), deny access
    if (!user || !user.organizationId) {
      throw new ForbiddenException('User organization not found');
    }

    // Extract organizationId from various sources
    const requestedOrgId =
      request.params?.organizationId ||
      request.query?.organizationId ||
      request.body?.organizationId;

    // If no organization specified in request, allow
    // The controller should use @CurrentOrg() to get user's organization
    if (!requestedOrgId) {
      return true;
    }

    // Validate user belongs to the requested organization
    if (user.organizationId !== requestedOrgId) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }

    return true;
  }
}
