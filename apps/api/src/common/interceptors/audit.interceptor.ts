import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Prisma, AuditAction } from '@prisma/client';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../utils/redact';
import {
  buildAuditSummary,
  resolveEntityId,
  resolveEntityType,
  truncateUserAgent,
} from './audit-summary';

interface AuditedUser {
  id: string;
  organizationId?: string;
}

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Records who wrote which entity. Only metadata is stored: entity type and id, action,
 * user, organization, IP/user agent, and a small redacted summary of the request. The
 * full response and any client-supplied "old data" are never persisted (they used to
 * be, which copied whole records, tokens and passwords into the audit table).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuditedUser }>();
    const method = request.method;
    const user = request.user;

    // Only audit write operations by authenticated users
    if (!AUDITED_METHODS.has(method) || !user) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response) => {
        void this.record(request, user, method, response);
      }),
    );
  }

  private async record(
    request: Request,
    user: AuditedUser,
    method: string,
    response: unknown,
  ): Promise<void> {
    try {
      const entityType = resolveEntityType(request.path);
      if (!entityType || !user.organizationId) return;

      const summary = method === 'DELETE' ? null : buildAuditSummary(request.body, response);

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: this.getAction(method),
          entityType,
          entityId: resolveEntityId(response, request.params?.id),
          // Never trust a client-supplied "old" snapshot and never store the response.
          oldValues: Prisma.DbNull,
          newValues: summary ? (summary as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          ipAddress: request.ip,
          userAgent: truncateUserAgent(request.headers['user-agent']),
          organizationId: user.organizationId,
        },
      });
    } catch (error) {
      // Don't fail the request if audit logging fails
      this.logger.error(`Audit logging failed: ${describeError(error)}`);
    }
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
}
