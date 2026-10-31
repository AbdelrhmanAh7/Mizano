import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { describeError } from '../../../common/utils/redact';
import { McpOAuthService, OAuthError } from './mcp-oauth.service';

type Params = Record<string, unknown>;

const ERROR_PAGES: Record<string, { ar: string; en: string }> = {
  not_configured: {
    ar: 'ربط تطبيقات الذكاء الاصطناعي غير مفعّل على هذا الخادم.',
    en: 'Connecting AI apps is not turned on for this server.',
  },
  unknown_client: {
    ar: 'هذا التطبيق غير معروف لميزان. ابدأ الربط من جديد من تطبيقك.',
    en: 'Mizano does not know this app. Start connecting again from your AI app.',
  },
  bad_redirect: {
    ar: 'عنوان الرجوع لا يطابق ما سجّله التطبيق، لذلك أوقف ميزان الربط لحمايتك.',
    en: 'The return address does not match what the app registered, so Mizano stopped to protect you.',
  },
};

/**
 * OAuth 2.1 authorization server and discovery documents. These live at the API origin root
 * (excluded from the /api prefix in main.ts) because clients look for them there.
 */
@ApiExcludeController()
@Controller()
export class McpOAuthController {
  private readonly logger = new Logger(McpOAuthController.name);

  constructor(private readonly oauth: McpOAuthService) {}

  @Get('.well-known/oauth-authorization-server')
  authorizationServer(@Res() res: Response): void {
    this.answer(res, () => this.oauth.authorizationServerMetadata());
  }

  @Get(['.well-known/oauth-protected-resource', '.well-known/oauth-protected-resource/mcp'])
  protectedResource(@Res() res: Response): void {
    this.answer(res, () => this.oauth.protectedResourceMetadata());
  }

  @Post('oauth/register')
  @Throttle({ long: { limit: 20, ttl: 60_000 } })
  async register(@Body() body: Params, @Res() res: Response): Promise<void> {
    await this.answerAsync(res, () => this.oauth.register(body ?? {}), 201);
  }

  @Get('oauth/authorize')
  async authorize(
    @Query() query: Params,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const outcome = await this.oauth.authorize(query, acceptLanguage);
      if ('redirect' in outcome) {
        res.redirect(302, outcome.redirect);
        return;
      }
      const text = ERROR_PAGES[outcome.errorPage] ?? ERROR_PAGES.unknown_client;
      res
        .status(400)
        .type('html')
        .set('Cache-Control', 'no-store')
        .send(
          `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mizano</title></head>` +
            `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.6">` +
            `<p dir="rtl">${text.ar}</p><p dir="ltr">${text.en}</p></body></html>`,
        );
    } catch (error) {
      this.logger.error(`authorize failed: ${describeError(error, { includeMessage: false })}`);
      res.status(500).type('text').send('Server error');
    }
  }

  @Post('oauth/token')
  @HttpCode(200)
  async token(
    @Body() body: Params,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.answerAsync(res, () => this.oauth.token(body ?? {}, authorization));
  }

  @Post('oauth/revoke')
  async revoke(
    @Body() body: Params,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.answerAsync(res, async () => {
      await this.oauth.revokeToken(body ?? {}, authorization);
      return {};
    });
  }

  private answer(res: Response, build: () => Record<string, unknown>): void {
    try {
      this.send(res, 200, build());
    } catch (error) {
      this.fail(res, error);
    }
  }

  private async answerAsync(
    res: Response,
    build: () => Promise<Record<string, unknown>>,
    status = 200,
  ): Promise<void> {
    try {
      this.send(res, status, await build());
    } catch (error) {
      this.fail(res, error);
    }
  }

  private send(res: Response, status: number, body: Record<string, unknown>): void {
    res.status(status).set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json(body);
  }

  /** RFC 6749 §5.2 shape; never echoes what the client sent. */
  private fail(res: Response, error: unknown): void {
    if (error instanceof OAuthError) {
      if (error.status === 401) res.set('WWW-Authenticate', 'Basic realm="mizano"');
      this.send(res, error.status, { error: error.error, error_description: error.description });
      return;
    }
    this.logger.error(`oauth endpoint failed: ${describeError(error, { includeMessage: false })}`);
    this.send(res, 500, { error: 'server_error', error_description: 'Server error' });
  }
}
