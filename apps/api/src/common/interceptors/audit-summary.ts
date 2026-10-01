import { redactSensitive } from '../utils/redact';

/**
 * Audit-trail summaries.
 *
 * The audit log answers "who changed which entity, when, and roughly how". It must
 * not become a second copy of the application data or a store for secrets, so only a
 * small, redacted description of the *request* is kept (never the full response):
 * credential-like keys are masked at any depth, strings are truncated, depth and array
 * length are capped, and the whole summary is dropped to field names when it is still
 * too large.
 */

/** Entity types that are never audited (high-volume or credential endpoints). */
export const AUDIT_EXCLUDED_ENTITY_TYPES: ReadonlySet<string> = new Set(['logger', 'internal']);

/** Max serialized size of the stored summary, in characters. */
export const AUDIT_SUMMARY_MAX_CHARS = 4000;

const MAX_FIELD_NAMES = 50;
const MAX_FIELD_NAME_LENGTH = 64;
const MAX_ENTITY_TYPE_LENGTH = 64;
const MAX_ENTITY_ID_LENGTH = 100;
const MAX_USER_AGENT_LENGTH = 255;

export interface AuditSummary {
  /** Top-level field names present in the request. */
  fields: string[];
  /** Redacted, size-capped copy of the request values. Omitted when over the cap. */
  values?: unknown;
  /** True when `values` was dropped because it exceeded the size cap. */
  truncated?: boolean;
  /** Short lifecycle status after the operation, if the response exposes one. */
  status?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Build the minimal summary for a write request. Returns `null` when there is nothing
 * worth recording (no body).
 */
export function buildAuditSummary(body: unknown, response?: unknown): AuditSummary | null {
  const status = extractStatus(response);

  if (!isRecord(body) || Object.keys(body).length === 0) {
    return status ? { fields: [], status } : null;
  }

  const fields = Object.keys(body)
    .slice(0, MAX_FIELD_NAMES)
    .map((key) => key.slice(0, MAX_FIELD_NAME_LENGTH));

  const values = redactSensitive(body, {
    maxDepth: 4,
    maxStringLength: 200,
    maxArrayLength: 20,
  });

  const summary: AuditSummary = { fields, values };
  if (status) summary.status = status;

  if (safeLength(summary) > AUDIT_SUMMARY_MAX_CHARS) {
    delete summary.values;
    summary.truncated = true;
  }
  return summary;
}

function safeLength(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function extractStatus(response: unknown): string | undefined {
  const source = isRecord(response) && isRecord(response.data) ? response.data : response;
  if (isRecord(source) && typeof source.status === 'string' && source.status.length <= 40) {
    return source.status;
  }
  return undefined;
}

/**
 * Entity id: the id of the created/updated entity from the response, else the route
 * param, else `unknown`. Only short strings are accepted so a response can never smuggle
 * a payload in through the id column.
 */
export function resolveEntityId(response: unknown, routeId: unknown): string {
  const candidates: unknown[] = [
    isRecord(response) ? response.id : undefined,
    isRecord(response) && isRecord(response.data) ? response.data.id : undefined,
    routeId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate.slice(0, MAX_ENTITY_ID_LENGTH);
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return 'unknown';
}

/**
 * Entity type from the route (`/api/customers/123` -> `customers`). Returns `null` for
 * paths that cannot be mapped or that are excluded from auditing.
 */
export function resolveEntityType(path: string | undefined): string | null {
  if (!path) return null;
  const first =
    path
      .replace(/^\/?api\//, '')
      .replace(/^\//, '')
      .split(/[/?]/)[0] ?? '';
  const normalised = first.toLowerCase().slice(0, MAX_ENTITY_TYPE_LENGTH);
  if (!/^[a-z0-9_-]+$/.test(normalised)) return null;
  if (AUDIT_EXCLUDED_ENTITY_TYPES.has(normalised)) return null;
  return normalised;
}

export function truncateUserAgent(userAgent: unknown): string | undefined {
  return typeof userAgent === 'string' ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : undefined;
}
