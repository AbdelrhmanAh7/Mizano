import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { IntegrationScope } from '../integration-catalog';
import { integrationRequestContext } from '../integration-request-context';
import { hashApiKey, looksLikeApiKey } from '../utils/api-key';

export const REQUIRED_SCOPES_KEY = 'integrationScopes';
/** Scopes the calling key must hold (all of them). Pair with @Permissions for the role check. */
export const RequireScopes = (...scopes: IntegrationScope[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);

export interface IntegrationPrincipal {
  /** The key's creator: the role and audit trail of every call. */
  id: string;
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
  apiKeyId: string;
  apiKeyName: string;
  scopes: string[];
}

const WINDOW_MS = 60_000;
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Fixed one-minute window per key. In-process state is enough for the single API process on
 * the Pi; a second API replica would need this moved to Redis.
 */
export class KeyRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  hit(
    keyId: string,
    limit: number,
    now = Date.now(),
  ): { allowed: boolean; remaining: number; resetMs: number } {
    let w = this.windows.get(keyId);
    if (!w || now - w.start >= WINDOW_MS) {
      w = { start: now, count: 0 };
      this.windows.set(keyId, w);
      if (this.windows.size > 5000) this.evict(now);
    }
    w.count += 1;
    const resetMs = w.start + WINDOW_MS - now;
    return { allowed: w.count <= limit, remaining: Math.max(0, limit - w.count), resetMs };
  }

  private evict(now: number): void {
    for (const [k, v] of this.windows) if (now - v.start >= WINDOW_MS) this.windows.delete(k);
  }
}

/** Authenticates `Authorization: Bearer mzk_…` (or `x-api-key`) for /integrations/v1 routes. */
@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(IntegrationApiKeyGuard.name);
  static limiter = new KeyRateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: IntegrationPrincipal }>();
    const res = context.switchToHttp().getResponse<Response>();
    const presented = extractKey(req);
    if (!presented || !looksLikeApiKey(presented)) {
      throw new UnauthorizedException('Missing or malformed integration API key');
    }

    const key = await this.prisma.integrationApiKey.findUnique({
      where: { keyHash: hashApiKey(presented) },
    });
    const now = new Date();
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now)) {
      throw new UnauthorizedException('Invalid, expired or revoked integration API key');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: key.createdById, organizationId: key.organizationId },
      select: { id: true, email: true, name: true, status: true, roleId: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('The user who created this key is no longer active');
    }

    const rate = IntegrationApiKeyGuard.limiter.hit(key.id, key.rateLimitPerMinute);
    res.setHeader('X-RateLimit-Limit', String(key.rateLimitPerMinute));
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(rate.resetMs / 1000))));
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Rate limit exceeded for this API key',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const required =
      this.reflector.getAllAndOverride<IntegrationScope[]>(REQUIRED_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    for (const scope of required) {
      if (!key.scopes.includes(scope)) throw new ForbiddenException(`Missing scope: ${scope}`);
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: key.organizationId,
      roleId: user.roleId,
      apiKeyId: key.id,
      apiKeyName: key.name,
      scopes: key.scopes,
    };
    const store = integrationRequestContext.getStore();
    if (store) {
      store.apiKeyId = key.id;
      store.apiKeyName = key.name;
    }

    if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      this.prisma.integrationApiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: now } })
        .catch((e: unknown) =>
          this.logger.warn(
            `lastUsedAt update failed: ${describeError(e, { includeMessage: false })}`,
          ),
        );
    }
    return true;
  }
}

function extractKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth))
    return auth.replace(/^Bearer\s+/i, '').trim();
  const header = req.headers['x-api-key'];
  return typeof header === 'string' ? header.trim() : null;
}
