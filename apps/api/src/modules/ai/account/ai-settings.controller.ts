import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AnyPermission, CurrentOrg, CurrentUser, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AiError } from './ai-features';
import { StoredPrice } from './ai-pricing';
import { AiGatewayService } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';
import {
  AiConsentDto,
  ChooseAiModelDto,
  ConnectAiDto,
  OpenRouterCompleteDto,
  OpenRouterStartDto,
  UpdateAiSettingsDto,
} from './dto/ai-settings.dto';
import { OpenRouterOAuthService } from './openrouter-oauth.service';

const PING_SCHEMA = z.object({ ok: z.literal(true) });

/**
 * Settings → AI: the organization's own AI account. Reads need `settings.view`, every change
 * `settings.edit`. Responses carry a key hint at most, never the key.
 */
@ApiTags('AI settings')
@ApiBearerAuth()
@Controller('ai-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiSettingsController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly gateway: AiGatewayService,
    private readonly openRouter: OpenRouterOAuthService,
  ) {}

  @Get()
  @Permissions('settings.view')
  view(@CurrentOrg() orgId: string) {
    return this.settings.view(orgId);
  }

  /** Which AI features are active, for screens that show or hide AI actions. */
  @Get('features')
  @AnyPermission('settings.view', 'purchases.create', 'reports.view')
  features(@CurrentOrg() orgId: string) {
    return this.settings.features(orgId);
  }

  @Get('usage')
  @Permissions('settings.view')
  usage(@CurrentOrg() orgId: string) {
    return this.settings.usage(orgId);
  }

  @Get('models')
  @Permissions('settings.view')
  models(@CurrentOrg() orgId: string) {
    return this.settings.listModels(orgId);
  }

  @Post('connect')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Check a provider key, save it sealed, then test it with one call' })
  async connect(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ConnectAiDto,
  ) {
    const { models } = await this.settings.connect(orgId, userId, dto);
    return { settings: await this.testAfterConnect(orgId, userId), models };
  }

  @Post('test')
  @HttpCode(200)
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'One tiny call through the connected provider (counts as usage)' })
  test(@CurrentOrg() orgId: string, @CurrentUser('id') userId: string) {
    return this.runTest(orgId, userId);
  }

  /**
   * One tiny call. A pass marks the connection verified; a provider refusal clears it and is
   * rethrown (the settings screen shows its reason). A change of settings mid-call proves nothing.
   */
  private async runTest(
    orgId: string,
    userId: string,
    trial?: { model: string; price: StoredPrice },
  ) {
    const started = Date.now();
    try {
      const result = await this.gateway.run({
        organizationId: orgId,
        userId,
        feature: 'test',
        trial,
        system: 'You check that an API connection works. Answer with JSON only.',
        parts: () => [{ type: 'text', text: 'Return exactly {"ok": true}' }],
        maxOutputTokens: 200,
        schema: PING_SCHEMA,
      });
      if (!trial) await this.settings.markVerified(orgId, true);
      return {
        ok: true,
        provider: result.provider,
        model: result.model,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const unrelated =
        error instanceof AiError &&
        (error.code === 'AI_SETTINGS_CHANGED' || error.code === 'AI_NOT_ENABLED');
      // A refused trial of another model says nothing about the saved one.
      if (!unrelated && !trial) await this.settings.markVerified(orgId, false);
      throw error;
    }
  }

  /** The test that follows connecting: a failure is not thrown, the view carries its reason. */
  private async testAfterConnect(orgId: string, userId: string) {
    try {
      await this.runTest(orgId, userId);
    } catch {
      // Recorded as the last AI error and an unverified connection; the screen shows both.
    }
    return this.settings.view(orgId);
  }

  @Post('model')
  @HttpCode(200)
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Choose a model: saved only after a real test call with it passes' })
  chooseModel(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ChooseAiModelDto,
  ) {
    return this.tryModel(orgId, userId, dto.model);
  }

  /**
   * A failed trial keeps the old choice and returns the provider's reason (an error code the
   * screen translates) with the next recommended models to try; nothing is saved.
   */
  private async tryModel(orgId: string, userId: string, model: string) {
    const { price, next } = await this.settings.planModelChange(orgId, model);
    try {
      await this.runTest(orgId, userId, { model, price });
    } catch (error) {
      if (error instanceof AiError && error.code !== 'AI_SETTINGS_CHANGED') {
        return { ok: false as const, code: error.code, suggestions: next.slice(0, 2) };
      }
      throw error;
    }
    return {
      ok: true as const,
      settings: await this.settings.saveTestedModel(orgId, model, price),
    };
  }

  @Patch()
  @Permissions('settings.edit')
  async update(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    const { model, ...rest } = dto;
    if (model !== undefined) {
      // The model only changes after it answered a real call.
      const tried = await this.tryModel(orgId, userId, model);
      if (!tried.ok) throw new AiError(tried.code, 'The model did not pass the test');
    }
    return Object.keys(rest).length > 0
      ? this.settings.update(orgId, rest)
      : this.settings.view(orgId);
  }

  @Post('consent')
  @HttpCode(200)
  @Permissions('settings.edit')
  consent(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AiConsentDto,
  ) {
    return this.settings.consent(orgId, userId, dto.provider);
  }

  @Post('revoke')
  @HttpCode(200)
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Disconnect: destroys the stored key, clears features and consent' })
  revoke(@CurrentOrg() orgId: string) {
    return this.settings.revoke(orgId);
  }

  @Post('openrouter/start')
  @HttpCode(200)
  @Permissions('settings.edit')
  startOpenRouter(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OpenRouterStartDto,
  ) {
    return this.openRouter.start(orgId, userId, dto.callbackUrl);
  }

  @Post('openrouter/complete')
  @HttpCode(200)
  @Permissions('settings.edit')
  async completeOpenRouter(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OpenRouterCompleteDto,
  ) {
    await this.openRouter.complete(orgId, userId, dto.state, dto.code);
    return this.testAfterConnect(orgId, userId);
  }
}
