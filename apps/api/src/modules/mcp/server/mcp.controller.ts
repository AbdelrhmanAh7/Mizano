import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthInfo } from '@modelcontextprotocol/server';
import { Request, Response } from 'express';
import { KeyRateLimiter } from '../../../common/utils/key-rate-limiter';
import { MCP_REQUESTS_PER_MINUTE, McpConfig, normalizeOrigin } from '../mcp.config';
import { resolveLocale } from '../mcp-locale';
import { McpOAuthService } from '../oauth/mcp-oauth.service';
import { McpServerService } from './mcp-server.service';

/**
 * /mcp at the API origin root (excluded from the /api prefix). Every request must carry an
 * access token issued for this server; the IP throttler is replaced by a per-connection limit.
 */
@ApiExcludeController()
@SkipThrottle({ short: true, long: true })
@Controller('mcp')
export class McpController {
  static limiter = new KeyRateLimiter();

  constructor(
    private readonly mcpConfig: McpConfig,
    private readonly oauth: McpOAuthService,
    private readonly server: McpServerService,
    private readonly config: ConfigService,
  ) {}

  @All()
  async handle(@Req() req: Request & { auth?: AuthInfo }, @Res() res: Response): Promise<void> {
    const resource = this.mcpConfig.resource;
    const metadataUrl = this.mcpConfig.resourceMetadataUrl;
    if (!resource || !metadataUrl) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    // DNS rebinding protection (spec: validate Origin). Server-side AI apps send none.
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins().has(origin)) {
      res.status(403).json({ error: 'forbidden', error_description: 'Origin not allowed' });
      return;
    }

    const header = req.headers.authorization;
    const presented =
      typeof header === 'string' && /^Bearer\s+/i.test(header)
        ? header.replace(/^Bearer\s+/i, '').trim()
        : undefined;
    const principal = presented ? await this.oauth.verifyAccessToken(presented) : null;
    if (!principal) {
      // RFC 6750 §3 + RFC 9728 §5.1: where to find the authorization server, and what to ask for.
      const challenge = `Bearer ${[
        `resource_metadata="${metadataUrl}"`,
        'scope="mizano:read"',
        ...(presented ? ['error="invalid_token"'] : []),
      ].join(', ')}`;
      res
        .status(401)
        .set('WWW-Authenticate', challenge)
        .json({ error: presented ? 'invalid_token' : 'unauthorized' });
      return;
    }

    const rate = McpController.limiter.hit(principal.grantId, MCP_REQUESTS_PER_MINUTE);
    if (!rate.allowed) {
      res
        .status(429)
        .set('Retry-After', String(Math.max(1, Math.ceil(rate.resetMs / 1000))))
        .json({ error: 'rate_limited' });
      return;
    }

    // The request language wins; otherwise the language the person used on the consent screen.
    const accept = req.headers['accept-language'];
    const locale =
      typeof accept === 'string' && accept.trim() ? resolveLocale(accept) : principal.locale;
    req.auth = {
      token: presented as string,
      clientId: principal.clientId,
      scopes: principal.scopes,
      expiresAt: Math.floor(principal.expiresAt.getTime() / 1000),
      resource: new URL(resource),
      resourceMetadataUrl: metadataUrl,
      extra: { principal: { ...principal, locale } },
    };
    await this.server.handle(req, res, req.body);
  }

  private allowedOrigins(): Set<string> {
    const raw = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const list = [this.mcpConfig.webOrigin, this.mcpConfig.issuer ?? ''];
    for (const o of raw) {
      try {
        list.push(normalizeOrigin(o));
      } catch {
        // an invalid CORS entry is ignored here; main.ts reports it
      }
    }
    return new Set(list.filter(Boolean));
  }
}
