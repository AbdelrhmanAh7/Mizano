import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { openSecret, sealSecret } from '../../../common/utils/secret-box';
import { AI_FETCH, AiProviderError, FetchLike } from '../providers/ai-provider';
import { asRecord, asString, requestJson } from '../providers/provider-http';
import { AiError } from './ai-features';
import { AiSettingsService, AiSettingsView } from './ai-settings.service';

const AUTH_URL = 'https://openrouter.ai/auth';
const EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';
const STATE_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TIMEOUT_MS = 15_000;

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const base64url = (buf: Buffer): string => buf.toString('base64url');
const verifierAad = (organizationId: string, userId: string): string =>
  `ai-oauth:${organizationId}:${userId}`;

/**
 * "Connect your OpenRouter account" with OAuth PKCE (S256). The state is random, stored hashed,
 * bound to the organization and the user who started it, expires after 10 minutes and can be
 * used once; the code verifier never leaves the server. The callback is the web settings page
 * on an origin the API already trusts (CORS_ORIGIN), so the flow cannot redirect elsewhere.
 */
@Injectable()
export class OpenRouterOAuthService {
  private readonly logger = new Logger(OpenRouterOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(AI_FETCH)
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {}

  /** The callback must be `<trusted origin>/<locale>/settings/ai`, nothing else. */
  private callback(raw: string, state: string): string {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('callbackUrl is not a valid URL');
    }
    const trusted = (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5001')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    if (!trusted.includes(url.origin) || !/^\/(en|ar)\/settings\/ai$/.test(url.pathname)) {
      throw new BadRequestException('callbackUrl must be the AI settings page of this app');
    }
    const back = new URL(url.pathname, url.origin);
    back.searchParams.set('openrouter_state', state);
    return back.toString();
  }

  async start(
    organizationId: string,
    userId: string,
    callbackUrl: string,
  ): Promise<{ authUrl: string; expiresAt: string }> {
    const state = base64url(randomBytes(32));
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const callback = this.callback(callbackUrl, state);
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    // Unused states of this user are dropped: only the latest flow can complete.
    await this.prisma.aiOAuthState.deleteMany({
      where: { organizationId, userId, usedAt: null },
    });
    await this.prisma.aiOAuthState.create({
      data: {
        organizationId,
        userId,
        stateHash: sha256(state),
        verifierCiphertext: sealSecret(verifier, verifierAad(organizationId, userId)),
        expiresAt,
      },
    });
    const auth = new URL(AUTH_URL);
    auth.searchParams.set('callback_url', callback);
    auth.searchParams.set('code_challenge', challenge);
    auth.searchParams.set('code_challenge_method', 'S256');
    return { authUrl: auth.toString(), expiresAt: expiresAt.toISOString() };
  }

  /** Consumes the state (once, same organization and user, unexpired) and saves the key. */
  async complete(
    organizationId: string,
    userId: string,
    state: string,
    code: string,
  ): Promise<AiSettingsView> {
    const now = new Date();
    const row = await this.prisma.aiOAuthState.findFirst({
      where: { stateHash: sha256(state), organizationId, userId },
    });
    const claimed = row
      ? await this.prisma.aiOAuthState.updateMany({
          where: { id: row.id, organizationId, userId, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        })
      : { count: 0 };
    if (!row || claimed.count !== 1) {
      throw new AiError(
        'AI_OAUTH_STATE_INVALID',
        'This OpenRouter sign-in expired or was already used',
      );
    }
    const verifier = openSecret(row.verifierCiphertext, verifierAad(organizationId, userId));

    let key: string | undefined;
    try {
      const body = await requestJson(
        this.fetchFn,
        EXCHANGE_URL,
        {
          method: 'POST',
          headers: {},
          body: { code, code_verifier: verifier, code_challenge_method: 'S256' },
        },
        AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      );
      key = asString(asRecord(body).key);
    } catch (error) {
      this.logger.warn(
        `OpenRouter code exchange failed: org=${organizationId} reason=${error instanceof AiProviderError ? error.kind : 'error'}`,
      );
      throw new AiError('AI_OAUTH_STATE_INVALID', 'OpenRouter did not accept the sign-in');
    }
    if (!key) throw new AiError('AI_OAUTH_STATE_INVALID', 'OpenRouter returned no key');
    const { settings } = await this.settings.connect(
      organizationId,
      userId,
      { provider: 'openrouter', apiKey: key },
      'openrouter_oauth',
    );
    return settings;
  }
}
