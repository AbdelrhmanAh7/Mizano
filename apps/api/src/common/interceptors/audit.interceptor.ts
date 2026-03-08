import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const user = request.user;

    // Only audit write operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !user) {
      return next.handle();
    }

    const oldData = request.body?._oldData; // Can be set by service before update

    return next.handle().pipe(
      tap((response) => {
        void (async () => {
          try {
            const action = this.getAction(method);
            const entityType = this.getEntityType(request.path);
            const entityId = response?.id || request.params?.id || 'unknown';

            if (entityType && user.organizationId) {
              await this.prisma.auditLog.create({
                data: {
                  userId: user.id,
                  action,
                  entityType,
                  entityId,
                  oldValues: oldData || null,
                  newValues: method !== 'DELETE' ? response : null,
                  ipAddress: request.ip,
                  userAgent: request.headers['user-agent'],
                  organizationId: user.organizationId,
                },
              });
            }
          } catch (error) {
            // Don't fail the request if audit logging fails
            console.error('Audit logging failed:', error);
          }
        })();
      }),
    );
  }

  private getAction(method: string): AuditAction {
    switch (method) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PUT':
      case 'PATCH':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      default:
        return AuditAction.UPDATE;
    }
  }

  private getEntityType(path: string): string | null {
    // Extract entity type from path like /api/customers/123
    const parts = path.replace('/api/', '').split('/');
    return parts[0] || null;
  }
}
