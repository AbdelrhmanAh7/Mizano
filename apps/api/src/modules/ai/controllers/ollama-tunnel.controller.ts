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
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

interface TunnelUpdateDto {
  tunnel_url: string;
  secret: string;
}

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
   * Authentication: shared secret (no JWT — Colab has no user session).
   */
  @Post('tunnel-update')
  @Public()
  @SkipThrottle({ short: true, long: true })
  async updateTunnel(
    @Body() body: TunnelUpdateDto,
  ): Promise<{ status: string; tunnel_url: string }> {
    const expectedSecret = this.config.get<string>('OLLAMA_WEBHOOK_SECRET');

    if (!expectedSecret || body.secret !== expectedSecret) {
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
          secret: body.secret,
        }),
      });
      const data = await response.json();
      this.logger.log(`Tunnel URL updated: ${body.tunnel_url}`);
      return { status: 'ok', tunnel_url: body.tunnel_url };
    } catch (error) {
      this.logger.error('Failed to update ollama-proxy tunnel URL', error);
      throw new HttpException('Failed to update proxy', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Returns the current health of the ollama-proxy and remote Ollama.
   * Requires admin authentication.
   */
  @Get('ollama-status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  async getStatus(): Promise<Record<string, unknown>> {
    try {
      const response = await fetch('http://ollama-proxy:11434/health');
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return { proxy: 'unreachable', ollama_reachable: false };
    }
  }
}
