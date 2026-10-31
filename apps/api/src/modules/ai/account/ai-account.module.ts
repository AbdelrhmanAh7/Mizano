import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { AiGatewayService } from './ai-gateway.service';
import { AiSettingsController } from './ai-settings.controller';
import { AiSettingsService } from './ai-settings.service';
import { OpenRouterOAuthService } from './openrouter-oauth.service';

/** The organization's own AI account: settings, provider adapters and the one call gateway. */
@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AiSettingsController],
  providers: [AiProviderRegistry, AiSettingsService, AiGatewayService, OpenRouterOAuthService],
  exports: [AiSettingsService, AiGatewayService],
})
export class AiAccountModule {}
