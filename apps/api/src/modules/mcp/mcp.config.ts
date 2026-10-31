import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What a person may allow an AI app to do. `drafts` includes everything `read` allows. */
export const MCP_SCOPES = ['mizano:read', 'mizano:drafts'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export type McpAccess = 'read' | 'drafts';

export const ACCESS_SCOPES: Record<McpAccess, McpScope[]> = {
  read: ['mizano:read'],
  drafts: ['mizano:read', 'mizano:drafts'],
};

export function accessOf(scopes: readonly string[]): McpAccess {
  return scopes.includes('mizano:drafts') ? 'drafts' : 'read';
}

/** Scope hierarchy (spec: a broader scope implies the narrower one). */
export function scopeSatisfied(granted: readonly string[], required: McpScope): boolean {
  if (required === 'mizano:read') {
    return granted.includes('mizano:read') || granted.includes('mizano:drafts');
  }
  return granted.includes('mizano:drafts');
}

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
export const AUTH_CODE_TTL_MS = 60 * 1000;
/** Requests per minute per connection (grant), so refreshing tokens can't reset the count. */
export const MCP_REQUESTS_PER_MINUTE = 90;

/**
 * Public addresses. `MCP_PUBLIC_URL` is the API's public origin (the hostname that serves
 * /mcp, /oauth/* and /.well-known/*). Otherwise use the existing public API address.
 */
@Injectable()
export class McpConfig {
  private readonly logger = new Logger(McpConfig.name);
  private warnedFallback = false;

  constructor(private readonly config: ConfigService) {}

  /** The issuer and API origin, without a trailing slash; null when not configured. */
  get issuer(): string | null {
    const raw = this.config.get<string>('MCP_PUBLIC_URL')?.trim();
    if (raw) return normalizeOrigin(raw);
    const apiUrl =
      this.config.get<string>('PUBLIC_API_URL')?.trim() ||
      this.config.get<string>('NEXT_PUBLIC_API_URL')?.trim();
    if (apiUrl) {
      // These settings include the REST prefix; MCP/OAuth live at the API origin.
      let origin: string;
      try {
        origin = normalizeOrigin(apiUrl.replace(/\/api\/?$/, '/'));
      } catch {
        if (!this.warnedFallback) {
          this.logger.warn(
            'MCP is off: the public API address is not an absolute origin or /api URL',
          );
          this.warnedFallback = true;
        }
        return null;
      }
      // A legacy HTTP REST address must not silently expose OAuth credentials.
      if (this.config.get<string>('NODE_ENV') === 'production' && !origin.startsWith('https:')) {
        return null;
      }
      return origin;
    }
    if (this.config.get<string>('NODE_ENV') === 'production') return null;
    const port = this.config.get<string>('API_PORT') || this.config.get<string>('PORT') || '6001';
    return `http://localhost:${port}`;
  }

  get enabled(): boolean {
    return this.issuer !== null;
  }

  /** Canonical MCP server URI: the token audience (RFC 8707). */
  get resource(): string | null {
    const issuer = this.issuer;
    return issuer ? `${issuer}/mcp` : null;
  }

  get resourceMetadataUrl(): string | null {
    const issuer = this.issuer;
    return issuer ? `${issuer}/.well-known/oauth-protected-resource/mcp` : null;
  }

  /** The web app origin that shows the consent screen and the document links. */
  get webOrigin(): string {
    const raw =
      this.config.get<string>('FRONTEND_URL') ||
      (this.config.get<string>('CORS_ORIGIN') ?? '').split(',')[0] ||
      'http://localhost:5001';
    return normalizeOrigin(raw.trim());
  }
}

/** `https://Api.Example.com/` → `https://api.example.com`; rejects paths, queries, credentials. */
export function normalizeOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('MCP_PUBLIC_URL must be an http(s) origin');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('MCP_PUBLIC_URL must be an origin only (no path, query or credentials)');
  }
  return url.origin;
}

/**
 * Whether a `resource` parameter names this MCP server. Scheme and host compare
 * case-insensitively (the spec asks servers to accept upper case); a trailing slash is allowed.
 */
export function isOurResource(candidate: string, resource: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.hash || url.search || url.username || url.password) return false;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}` === resource;
}
