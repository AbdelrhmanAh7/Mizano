import { Prisma } from '@prisma/client';

/**
 * Append-only AuditLog marker written in the same transaction as a draft created from an intake
 * job (entityType INTAKE_DRAFT, entityId = job id). Users cannot edit it, unlike the draft's
 * notes or reference, so the recovery sweep can always find the draft a job produced.
 */
export const INTAKE_DRAFT_ENTITY = 'INTAKE_DRAFT';

export interface IntakeDraftLink {
  draftDocumentType: string;
  draftDocumentId: string;
}

/** The draft a marker names, or null when the stored values are not a marker. */
export function parseIntakeDraftMarker(values: Prisma.JsonValue | null): IntakeDraftLink | null {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const { draftDocumentType, draftDocumentId } = values as Record<string, unknown>;
  return typeof draftDocumentType === 'string' && typeof draftDocumentId === 'string'
    ? { draftDocumentType, draftDocumentId }
    : null;
}
