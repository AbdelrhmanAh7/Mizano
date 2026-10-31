import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { McpClient, Prisma, UserStatus } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { timingSafeStringEqual } from '../../../common/utils/secure-compare.util';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ACCESS_SCOPES,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_MS,
  AUTH_REQUEST_TTL_MS,
  McpAccess,
  McpConfig,
  REFRESH_TOKEN_TTL_SECONDS,
  accessOf,
  isOurResource,
} from '../mcp.config';
import { McpLocale, resolveLocale } from '../mcp-locale';
import {
  isValidChallenge,
  looksLikeCredential,
  newClientId,
  newCredential,
  pkceMatches,
  sha256Hex,
} from './oauth-crypto';
import { buildRedirect, isRegistrableRedirectUri, redirectUriAllowed } from './redirect-uri';

/** RFC 6749 §5.2 / RFC 7591 §3.2.2 error, answered as `{ error, error_description }`. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
}

/** The signed-in Mizano user answering the consent screen (from the web session JWT). */
export interface ConsentUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
}

/** Who an MCP access token acts for. */
export interface McpPrincipal {
  grantId: string;
  organizationId: string;
  userId: string;
  roleId: string;
  scopes: string[];
  clientId: string;
  locale: McpLocale;
  expiresAt: Date;
}

export type AuthorizeOutcome = { redirect: string } | { errorPage: string };

const SUPPORTED_AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'];
const SUPPORTED_GRANTS = ['authorization_code', 'refresh_token'];
const MAX_REDIRECT_URIS = 10;
const LAST_USED_RESOLUTION_MS = 60_000;

type Params = Record<string, unknown>;

function str(params: Params, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

/** Visible text from an app: no control characters, bounded. */
function cleanName(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
  return text.slice(0, 100) || 'AI app';
}

@Injectable()
export class McpOAuthService {
  private readonly logger = new Logger(McpOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpConfig: McpConfig,
    private readonly permissions: PermissionsGuard,
  ) {}

  // ── Metadata ───────────────────────────────────────────────

  /** RFC 8414. */
  authorizationServerMetadata(): Record<string, unknown> {
    const issuer = this.requireIssuer();
    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: SUPPORTED_GRANTS,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: SUPPORTED_AUTH_METHODS,
      revocation_endpoint_auth_methods_supported: SUPPORTED_AUTH_METHODS,
      scopes_supported: ACCESS_SCOPES.drafts,
      ui_locales_supported: ['ar', 'en'],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: false,
    };
  }

  /** RFC 9728. */
  protectedResourceMetadata(): Record<string, unknown> {
    const issuer = this.requireIssuer();
    return {
      resource: this.mcpConfig.resource,
      authorization_servers: [issuer],
      scopes_supported: ACCESS_SCOPES.drafts,
      bearer_methods_supported: ['header'],
      resource_name: 'Mizano',
    };
  }

  private requireIssuer(): string {
    const issuer = this.mcpConfig.issuer;
    if (!issuer) throw new OAuthError('temporarily_unavailable', 'MCP is not configured', 404);
    return issuer;
  }

  // ── Dynamic client registration (RFC 7591) ─────────────────

  async register(body: Params): Promise<Record<string, unknown>> {
    this.requireIssuer();
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
      throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1 to 10 addresses');
    }
    if (!uris.every(isRegistrableRedirectUri)) {
      throw new OAuthError(
        'invalid_redirect_uri',
        'Each redirect URI must be https, or http on a loopback address, without a fragment',
      );
    }
    // RFC 7591 §2: the default is client_secret_basic.
    const method = str(body, 'token_endpoint_auth_method') ?? 'client_secret_basic';
    if (!SUPPORTED_AUTH_METHODS.includes(method)) {
      throw new OAuthError('invalid_client_metadata', 'Unsupported token_endpoint_auth_method');
    }
    const grantTypes = body.grant_types ?? SUPPORTED_GRANTS;
    if (
      !Array.isArray(grantTypes) ||
      !grantTypes.includes('authorization_code') ||
      !grantTypes.every((g) => typeof g === 'string' && SUPPORTED_GRANTS.includes(g))
    ) {
      throw new OAuthError(
        'invalid_client_metadata',
        'grant_types must include authorization_code and may add refresh_token',
      );
    }
    const responseTypes = body.response_types ?? ['code'];
    if (
      !Array.isArray(responseTypes) ||
      responseTypes.length !== 1 ||
      responseTypes[0] !== 'code'
    ) {
      throw new OAuthError('invalid_client_metadata', 'response_types must be ["code"]');
    }
    const clientUri = str(body, 'client_uri');
    const secret = method === 'none' ? null : newCredential('secret');
    const client = await this.prisma.mcpClient.create({
      data: {
        clientId: newClientId(),
        clientName: cleanName(body.client_name),
        redirectUris: uris as string[],
        tokenEndpointAuthMethod: method,
        clientSecretHash: secret ? sha256Hex(secret) : null,
        clientUri: clientUri && /^https:\/\//.test(clientUri) ? clientUri.slice(0, 500) : null,
        softwareId: str(body, 'software_id')?.slice(0, 200) ?? null,
        softwareVersion: str(body, 'software_version')?.slice(0, 100) ?? null,
      },
    });
    this.logger.log(`MCP client registered: ${client.id} (${method})`);
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      ...(secret && { client_secret: secret, client_secret_expires_at: 0 }),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: method,
    };
  }

  // ── Authorization endpoint ─────────────────────────────────

  /**
   * Validates the request and hands it to the consent screen. An unknown client or a redirect
   * address it did not register is shown as an error page and never redirected to (RFC 6749
   * §4.1.2.1: no open redirect); other errors go back to the app with `error` and `iss`.
   */
  async authorize(query: Params, acceptLanguage: string | undefined): Promise<AuthorizeOutcome> {
    const issuer = this.mcpConfig.issuer;
    const resource = this.mcpConfig.resource;
    if (!issuer || !resource) return { errorPage: 'not_configured' };

    const clientId = str(query, 'client_id');
    const client = clientId
      ? await this.prisma.mcpClient.findUnique({ where: { clientId } })
      : null;
    if (!client) return { errorPage: 'unknown_client' };

    const requested = str(query, 'redirect_uri');
    let redirectUri: string;
    if (requested === undefined) {
      if (client.redirectUris.length !== 1) return { errorPage: 'bad_redirect' };
      redirectUri = client.redirectUris[0];
    } else if (redirectUriAllowed(requested, client.redirectUris)) {
      redirectUri = requested;
    } else {
      return { errorPage: 'bad_redirect' };
    }

    const state = str(query, 'state');
    const fail = (error: string, description: string): AuthorizeOutcome => ({
      redirect: buildRedirect(redirectUri, {
        error,
        error_description: description,
        state,
        iss: issuer,
      }),
    });

    if (str(query, 'response_type') !== 'code') {
      return fail('unsupported_response_type', 'Only response_type=code is supported');
    }
    const challenge = str(query, 'code_challenge');
    if (!isValidChallenge(challenge)) {
      return fail('invalid_request', 'PKCE code_challenge (S256) is required');
    }
    if (str(query, 'code_challenge_method') !== 'S256') {
      return fail('invalid_request', 'code_challenge_method must be S256');
    }
    const resourceParam = str(query, 'resource');
    if (resourceParam !== undefined && !isOurResource(resourceParam, resource)) {
      return fail('invalid_target', 'resource must be this MCP server');
    }
    if (state !== undefined && state.length > 1000) {
      return fail('invalid_request', 'state is too long');
    }
    const scopes = (str(query, 'scope') ?? '').split(' ').filter(Boolean);
    const access: McpAccess = scopes.includes('mizano:drafts') ? 'drafts' : 'read';
    const locale = resolveLocale(str(query, 'ui_locales') ?? acceptLanguage);

    const handle = newCredential('req');
    await this.prisma.mcpAuthRequest.create({
      data: {
        requestHash: sha256Hex(handle),
        clientId: client.id,
        redirectUri,
        state: state ?? null,
        codeChallenge: challenge,
        scopes: ACCESS_SCOPES[access],
        resource,
        locale,
        expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS),
      },
    });
    return { redirect: `${this.mcpConfig.webOrigin}/${locale}/connect-ai/${handle}` };
  }

  // ── Consent (signed-in web user) ───────────────────────────

  async viewRequest(handle: string, user: ConsentUser): Promise<Record<string, unknown>> {
    const request = await this.openRequest(handle);
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!organization) throw new ForbiddenException('Organization not found');
    return {
      requestId: handle,
      clientName: request.client.clientName,
      redirectHost: new URL(request.redirectUri).host,
      requestedAccess: accessOf(request.scopes),
      organization,
      user: { name: user.name, email: user.email },
      expiresAt: request.expiresAt.toISOString(),
    };
  }

  /**
   * The grant is bound to the organization the person is signed into. Another organization's
   * user row with the same email is not proof of identity there, so it is never offered.
   */
  async approve(
    handle: string,
    user: ConsentUser,
    access: McpAccess,
  ): Promise<{ redirectUrl: string }> {
    const issuer = this.requireIssuerForWeb();
    return this.prisma.$transaction(async (tx) => {
      const request = await this.consumeRequest(tx, handle);
      const grant = await tx.mcpGrant.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          clientId: request.clientId,
          scopes: ACCESS_SCOPES[access],
          locale: request.locale,
        },
      });
      const code = newCredential('code');
      await tx.mcpAuthCode.create({
        data: {
          codeHash: sha256Hex(code),
          grantId: grant.id,
          redirectUri: request.redirectUri,
          codeChallenge: request.codeChallenge,
          resource: request.resource,
          expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
        },
      });
      this.logger.log(`MCP grant ${grant.id} created (org ${user.organizationId}, ${access})`);
      return {
        redirectUrl: buildRedirect(request.redirectUri, {
          code,
          state: request.state,
          iss: issuer,
        }),
      };
    });
  }

  async deny(handle: string): Promise<{ redirectUrl: string }> {
    const issuer = this.requireIssuerForWeb();
    const request = await this.prisma.$transaction((tx) => this.consumeRequest(tx, handle));
    return {
      redirectUrl: buildRedirect(request.redirectUri, {
        error: 'access_denied',
        error_description: 'The person declined',
        state: request.state,
        iss: issuer,
      }),
    };
  }

  private requireIssuerForWeb(): string {
    const issuer = this.mcpConfig.issuer;
    if (!issuer) {
      throw new NotFoundException({ message: 'MCP is not configured', code: 'MCP_NOT_CONFIGURED' });
    }
    return issuer;
  }

  private async openRequest(handle: string) {
    const request = looksLikeCredential(handle, 'req')
      ? await this.prisma.mcpAuthRequest.findUnique({
          where: { requestHash: sha256Hex(handle) },
          include: { client: { select: { clientName: true } } },
        })
      : null;
    if (!request || request.consumedAt) {
      throw new NotFoundException({
        message: 'This connection request was not found or was already answered',
        code: 'MCP_REQUEST_NOT_FOUND',
      });
    }
    if (request.expiresAt <= new Date()) {
      throw new NotFoundException({
        message: 'This connection request expired',
        code: 'MCP_REQUEST_EXPIRED',
      });
    }
    return request;
  }

  /** Guarded single use: only one answer (allow or deny) can consume a request. */
  private async consumeRequest(tx: Prisma.TransactionClient, handle: string) {
    if (!looksLikeCredential(handle, 'req')) await this.openRequest(handle);
    const requestHash = sha256Hex(handle);
    const now = new Date();
    const consumed = await tx.mcpAuthRequest.updateMany({
      where: { requestHash, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      await this.openRequest(handle); // throws the precise reason
      throw new NotFoundException({ message: 'Request not found', code: 'MCP_REQUEST_NOT_FOUND' });
    }
    return tx.mcpAuthRequest.findUniqueOrThrow({ where: { requestHash } });
  }

  // ── Token endpoint ─────────────────────────────────────────

  async token(body: Params, authorization: string | undefined): Promise<Record<string, unknown>> {
    const resource = this.mcpConfig.resource;
    if (!resource) throw new OAuthError('temporarily_unavailable', 'MCP is not configured', 404);
    const client = await this.authenticateClient(body, authorization);
    const grantType = str(body, 'grant_type');
    if (grantType === 'authorization_code') return this.exchangeCode(client, body, resource);
    if (grantType === 'refresh_token') return this.refresh(client, body, resource);
    throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
  }

  private async exchangeCode(
    client: McpClient,
    body: Params,
    resource: string,
  ): Promise<Record<string, unknown>> {
    const code = str(body, 'code');
    if (!looksLikeCredential(code, 'code')) throw new OAuthError('invalid_grant', 'Invalid code');
    const row = await this.prisma.mcpAuthCode.findUnique({
      where: { codeHash: sha256Hex(code) },
      include: { grant: true },
    });
    if (!row || row.grant.clientId !== client.id) {
      throw new OAuthError('invalid_grant', 'Invalid code');
    }
    if (row.usedAt) {
      // A code presented twice was intercepted or replayed: end everything it produced.
      await this.revokeGrant(row.grantId, 'CODE_REUSE');
      throw new OAuthError('invalid_grant', 'Code already used');
    }
    if (row.expiresAt <= new Date()) throw new OAuthError('invalid_grant', 'Code expired');
    if (str(body, 'redirect_uri') !== row.redirectUri) {
      throw new OAuthError(
        'invalid_grant',
        'redirect_uri does not match the authorization request',
      );
    }
    if (!pkceMatches(body.code_verifier, row.codeChallenge)) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed');
    }
    const resourceParam = str(body, 'resource');
    if (resourceParam !== undefined && !isOurResource(resourceParam, row.resource)) {
      throw new OAuthError('invalid_target', 'resource must be this MCP server');
    }

    return this.prisma.$transaction(async (tx) => {
      const used = await tx.mcpAuthCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw new OAuthError('invalid_grant', 'Code already used');
      await this.assertGrantUsable(tx, row.grantId);
      return this.issueTokens(tx, client, row.grant, resource);
    });
  }

  /**
   * Rotation with reuse detection (OAuth 2.1 §4.3.1): each refresh token works once. If a used
   * one comes back, either the app or a thief holds a copy, so the whole grant is revoked.
   */
  private async refresh(
    client: McpClient,
    body: Params,
    resource: string,
  ): Promise<Record<string, unknown>> {
    const presented = str(body, 'refresh_token');
    if (!looksLikeCredential(presented, 'rt')) {
      throw new OAuthError('invalid_grant', 'Invalid refresh token');
    }
    const row = await this.prisma.mcpToken.findUnique({
      where: { tokenHash: sha256Hex(presented) },
      include: { grant: true },
    });
    if (!row || row.kind !== 'REFRESH' || row.grant.clientId !== client.id) {
      throw new OAuthError('invalid_grant', 'Invalid refresh token');
    }
    if (row.usedAt) {
      await this.revokeGrant(row.grantId, 'REFRESH_REUSE');
      this.logger.warn(`MCP refresh token reuse: grant ${row.grantId} revoked`);
      throw new OAuthError('invalid_grant', 'Refresh token already used');
    }
    if (row.expiresAt <= new Date() || row.grant.revokedAt) {
      throw new OAuthError('invalid_grant', 'Refresh token expired or revoked');
    }
    const resourceParam = str(body, 'resource');
    if (resourceParam !== undefined && !isOurResource(resourceParam, row.resource)) {
      throw new OAuthError('invalid_target', 'resource must be this MCP server');
    }
    const scope = str(body, 'scope');
    if (scope && !scope.split(' ').every((s) => !s || row.grant.scopes.includes(s))) {
      throw new OAuthError('invalid_scope', 'A refresh cannot add access');
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const used = await tx.mcpToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) return null; // lost a race with another use of the same token
      await this.assertGrantUsable(tx, row.grantId);
      return this.issueTokens(tx, client, row.grant, resource);
    });
    if (!outcome) {
      await this.revokeGrant(row.grantId, 'REFRESH_REUSE');
      throw new OAuthError('invalid_grant', 'Refresh token already used');
    }
    return outcome;
  }

  private async assertGrantUsable(tx: Prisma.TransactionClient, grantId: string): Promise<void> {
    const grant = await tx.mcpGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.revokedAt) throw new OAuthError('invalid_grant', 'Access was revoked');
    const user = await tx.user.findFirst({
      where: { id: grant.userId, organizationId: grant.organizationId },
      select: { status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new OAuthError('invalid_grant', 'The person who allowed this is no longer active');
    }
  }

  private async issueTokens(
    tx: Prisma.TransactionClient,
    client: McpClient,
    grant: { id: string; organizationId: string; scopes: string[] },
    resource: string,
  ): Promise<Record<string, unknown>> {
    const now = Date.now();
    const accessToken = newCredential('at');
    const refreshToken = newCredential('rt');
    await tx.mcpToken.createMany({
      data: [
        {
          tokenHash: sha256Hex(accessToken),
          grantId: grant.id,
          organizationId: grant.organizationId,
          kind: 'ACCESS',
          resource,
          expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
        },
        {
          tokenHash: sha256Hex(refreshToken),
          grantId: grant.id,
          organizationId: grant.organizationId,
          kind: 'REFRESH',
          resource,
          expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
      ],
    });
    await tx.mcpClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date(now) } });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: grant.scopes.join(' '),
    };
  }

  /** RFC 6749 §2.3: client_secret_basic, client_secret_post or a public client (`none`). */
  private async authenticateClient(body: Params, authorization?: string): Promise<McpClient> {
    let clientId = str(body, 'client_id');
    let secret = str(body, 'client_secret');
    let usedBasic = false;
    if (authorization && /^Basic\s+/i.test(authorization)) {
      const decoded = Buffer.from(authorization.replace(/^Basic\s+/i, ''), 'base64').toString();
      const sep = decoded.indexOf(':');
      if (sep < 0) throw new OAuthError('invalid_client', 'Malformed client credentials', 401);
      try {
        clientId = decodeURIComponent(decoded.slice(0, sep));
        secret = decodeURIComponent(decoded.slice(sep + 1));
      } catch {
        // A bad percent-escape is a client error (RFC 6749 §5.2), not a server one.
        throw new OAuthError('invalid_client', 'Malformed client credentials', 401);
      }
      usedBasic = true;
    }
    const client = clientId
      ? await this.prisma.mcpClient.findUnique({ where: { clientId } })
      : null;
    if (!client) throw new OAuthError('invalid_client', 'Unknown client', 401);
    if (client.tokenEndpointAuthMethod === 'none') return client;
    const methodOk =
      client.tokenEndpointAuthMethod === 'client_secret_basic' ? usedBasic : !usedBasic;
    if (
      !methodOk ||
      !client.clientSecretHash ||
      !secret ||
      !timingSafeStringEqual(sha256Hex(secret), client.clientSecretHash)
    ) {
      throw new OAuthError('invalid_client', 'Client authentication failed', 401);
    }
    return client;
  }

  /** RFC 7009: always 200; a token of this client ends its whole grant. */
  async revokeToken(body: Params, authorization: string | undefined): Promise<void> {
    const client = await this.authenticateClient(body, authorization);
    const token = str(body, 'token');
    if (!token || !(looksLikeCredential(token, 'at') || looksLikeCredential(token, 'rt'))) return;
    const row = await this.prisma.mcpToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { grant: { select: { clientId: true } } },
    });
    if (row && row.grant.clientId === client.id) await this.revokeGrant(row.grantId, 'CLIENT');
  }

  private async revokeGrant(grantId: string, reason: string, byId?: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mcpGrant.updateMany({
        where: { id: grantId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason, revokedById: byId ?? null },
      }),
      this.prisma.mcpToken.deleteMany({ where: { grantId } }),
    ]);
  }

  // ── Resource server: access token check ────────────────────

  async verifyAccessToken(raw: string | undefined): Promise<McpPrincipal | null> {
    const resource = this.mcpConfig.resource;
    if (!resource || !looksLikeCredential(raw, 'at')) return null;
    const row = await this.prisma.mcpToken.findUnique({
      where: { tokenHash: sha256Hex(raw) },
      include: { grant: { include: { client: { select: { clientId: true } } } } },
    });
    const now = new Date();
    // Audience binding: a token is accepted only by the server it was issued for.
    if (
      !row ||
      row.kind !== 'ACCESS' ||
      row.expiresAt <= now ||
      row.resource !== resource ||
      row.grant.revokedAt
    ) {
      return null;
    }
    const grant = row.grant;
    const user = await this.prisma.user.findFirst({
      where: { id: grant.userId, organizationId: grant.organizationId },
      select: { status: true, roleId: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return null;

    if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      this.prisma.mcpGrant
        .update({ where: { id: grant.id }, data: { lastUsedAt: now } })
        .catch((e: unknown) =>
          this.logger.warn(
            `lastUsedAt update failed: ${describeError(e, { includeMessage: false })}`,
          ),
        );
    }
    return {
      grantId: grant.id,
      organizationId: grant.organizationId,
      userId: grant.userId,
      roleId: user.roleId,
      scopes: grant.scopes,
      clientId: grant.client.clientId,
      locale: resolveLocale(grant.locale),
      expiresAt: row.expiresAt,
    };
  }

  // ── Connected apps (Settings → AI) ─────────────────────────

  async listConnections(user: ConsentUser): Promise<Record<string, unknown>> {
    const canManageAll = await this.permissions.roleHolds(user.roleId, ['settings.edit']);
    const grants = await this.prisma.mcpGrant.findMany({
      where: {
        organizationId: user.organizationId,
        revokedAt: null,
        ...(canManageAll ? {} : { userId: user.id }),
      },
      include: { client: { select: { clientName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, id: { in: grants.map((g) => g.userId) } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      serverUrl: this.mcpConfig.resource,
      canManageAll,
      connections: grants.map((g) => ({
        id: g.id,
        clientName: g.client.clientName,
        access: accessOf(g.scopes),
        userName: names.get(g.userId) ?? '',
        isMine: g.userId === user.id,
        createdAt: g.createdAt.toISOString(),
        lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
      })),
    };
  }

  async revokeConnection(user: ConsentUser, grantId: string): Promise<{ revoked: true }> {
    const grant = await this.prisma.mcpGrant.findFirst({
      where: { id: grantId, organizationId: user.organizationId, revokedAt: null },
      select: { id: true, userId: true },
    });
    if (!grant) {
      throw new NotFoundException({
        message: 'Connection not found',
        code: 'MCP_CONNECTION_NOT_FOUND',
      });
    }
    if (
      grant.userId !== user.id &&
      !(await this.permissions.roleHolds(user.roleId, ['settings.edit']))
    ) {
      throw new ForbiddenException({
        message: 'Only its owner or a settings manager can disconnect this app',
        code: 'MCP_FORBIDDEN',
      });
    }
    await this.revokeGrant(grant.id, 'USER', user.id);
    return { revoked: true };
  }

  // ── Housekeeping ───────────────────────────────────────────

  /** Expired requests, codes and tokens, and registrations nobody ever connected (30 days). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    try {
      const [requests, codes, tokens, clients] = await this.prisma.$transaction([
        this.prisma.mcpAuthRequest.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.mcpAuthCode.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.mcpToken.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.mcpClient.deleteMany({
          where: { createdAt: { lt: monthAgo }, grants: { none: {} } },
        }),
      ]);
      this.logger.log(
        `MCP purge: ${requests.count} requests, ${codes.count} codes, ${tokens.count} tokens, ${clients.count} clients`,
      );
    } catch (error) {
      this.logger.warn(`MCP purge failed: ${describeError(error, { includeMessage: false })}`);
    }
  }
}
