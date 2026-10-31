import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PurchasesModule } from '../purchases/purchases.module';
import { ReportsModule } from '../reports/reports.module';
import { SalesModule } from '../sales/sales.module';
import { TaxModule } from '../tax/tax.module';
import { McpConfig } from './mcp.config';
import { McpConnectionsController, McpConsentController } from './oauth/mcp-consent.controller';
import { McpOAuthController } from './oauth/mcp-oauth.controller';
import { McpOAuthService } from './oauth/mcp-oauth.service';
import { McpController } from './server/mcp.controller';
import { McpServerService } from './server/mcp-server.service';
import { McpToolsService } from './server/mcp-tools.service';

/**
 * AI apps (the owner's Claude, ChatGPT, Codex or Gemini) connect to Mizano over MCP with
 * OAuth 2.1. Every tool call acts as the person who allowed it, inside their organization.
 */
@Module({
  imports: [SalesModule, PurchasesModule, ReportsModule, TaxModule],
  controllers: [McpOAuthController, McpConsentController, McpConnectionsController, McpController],
  providers: [McpConfig, McpOAuthService, McpToolsService, McpServerService, PermissionsGuard],
})
export class McpModule {}
