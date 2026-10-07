import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/**
 * Marks a read-only POST route (a query that needs a body, e.g. a duplicate check) so the
 * AuditInterceptor does not record it as a CREATE.
 */
export const SkipAudit = (): CustomDecorator<string> => SetMetadata(SKIP_AUDIT_KEY, true);
