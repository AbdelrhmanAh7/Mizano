import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Permissions, Public } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { describeError } from '../../../common/utils/redact';
import { timingSafeStringEqual } from '../utils/secure-compare.util';

interface TunnelUpdateDto {
  tunnel_url: string;
  secret: string;
}

const PROXY_TIMEOUT_MS = 10_000;

/**
 * Internal endpoints for Ollama tunnel management.
 *
 * - POST /api/internal/tunnel-update — webhook from Colab (no JWT, secret-based auth)
 * - GET  /api/internal/ollama-status  — proxy health (admin auth required)
 */
@Controller('internal')
export class OllamaTunnelController {
  private readonly logger = new Logger(OllamaTunnelController.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Webhook called by the Colab notebook whenever a new Cloudflare tunnel URL
   * is established.  Forwards the URL to the ollama-proxy container.
   *
   * Authentication: shared secret (no JWT — Colab has no user session). The
   * endpoint is public, so it is rate limited (secret guessing) and the secret
   * is compared in constant time. If no secret is configured, every call is refused.
   */
  @Post('tunnel-update')
  @Public()
  @Throttle({ short: { ttl: 60_000, limit: 10 }, long: { ttl: 60_000, limit: 10 } })
  async updateTunnel(
    @Body() body: TunnelUpdateDto,
  ): Promise<{ status: string; tunnel_url: string }> {
    const expectedSecret = this.config.get<string>('OLLAMA_WEBHOOK_SECRET');

    if (!expectedSecret || !timingSafeStringEqual(body?.secret, expectedSecret)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    if (!body.tunnel_url?.startsWith('https://')) {
      throw new HttpException('Invalid tunnel URL', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await fetch('http://ollama-proxy:11434/api/internal/tunnel-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tunnel_url: body.tunnel_url,
          secret: expectedSecret,
        }),
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.error(`ollama-proxy rejected tunnel update (status=${response.status})`);
        throw new HttpException('Failed to update proxy', HttpStatus.BAD_GATEWAY);
      }
      // The tunnel URL is an access path to the model host: never log it.
      this.logger.log('Tunnel URL updated');
      return { status: 'ok', tunnel_url: body.tunnel_url };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to update ollama-proxy tunnel URL: ${describeError(error)}`);
      throw new HttpException('Failed to update proxy', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Returns the current health of the ollama-proxy and remote Ollama.
   * Requires an admin-level permission (`settings.edit`: held by the Admin role,
   * not by Manager). The tunnel URL is deliberately not returned.
   */
  @Get('ollama-status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.edit')
  async getStatus(): Promise<Record<string, unknown>> {
    try {
      const response = await fetch('http://ollama-proxy:11434/health', {
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
      const health = (await response.json()) as Record<string, unknown>;
      return {
        proxy: health.proxy,
        ollama_reachable: health.ollama_reachable === true,
        // Newer proxies report `tunnel_configured`; older ones returned the URL itself, which
        // is never passed on.
        tunnel_configured:
          health.tunnel_configured === true ||
          (typeof health.tunnel_url === 'string' && health.tunnel_url !== 'NOT_CONFIGURED'),
        timestamp: health.timestamp,
      };
    } catch {
      return { proxy: 'unreachable', ollama_reachable: false };
    }
  }
}
