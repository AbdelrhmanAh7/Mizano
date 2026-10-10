import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/**
 * Marks a read-only POST route (a query that needs a body, e.g. a duplicate check) so the
 * AuditInterceptor does not record it as a CREATE.
 *
 * Handler-level only: the interceptor ignores it on a class, and it must never be put on a
 * route that posts, mutates or deletes anything. Those stay audited.
 */
export const SkipAudit = (): CustomDecorator<string> => SetMetadata(SKIP_AUDIT_KEY, true);
