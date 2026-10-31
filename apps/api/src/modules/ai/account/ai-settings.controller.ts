import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AnyPermission, CurrentOrg, CurrentUser, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AiGatewayService } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';
import {
  AiConsentDto,
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
  @ApiOperation({ summary: 'Verify a provider key by listing its models, then save it sealed' })
  connect(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ConnectAiDto,
  ) {
    return this.settings.connect(orgId, userId, dto);
  }

  @Post('test')
  @HttpCode(200)
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'One tiny call through the connected provider (counts as usage)' })
  async test(@CurrentOrg() orgId: string, @CurrentUser('id') userId: string) {
    const started = Date.now();
    const result = await this.gateway.run({
      organizationId: orgId,
      userId,
      feature: 'test',
      system: 'You check that an API connection works. Answer with JSON only.',
      parts: () => [{ type: 'text', text: 'Return exactly {"ok": true}' }],
      maxOutputTokens: 200,
      schema: PING_SCHEMA,
    });
    return {
      ok: true,
      provider: result.provider,
      model: result.model,
      latencyMs: Date.now() - started,
    };
  }

  @Patch()
  @Permissions('settings.edit')
  update(@CurrentOrg() orgId: string, @Body() dto: UpdateAiSettingsDto) {
    return this.settings.update(orgId, dto);
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
  completeOpenRouter(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OpenRouterCompleteDto,
  ) {
    return this.openRouter.complete(orgId, userId, dto.state, dto.code);
  }
}
