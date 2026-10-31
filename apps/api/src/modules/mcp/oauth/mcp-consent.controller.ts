import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { McpAccess } from '../mcp.config';
import { ConsentUser, McpOAuthService } from './mcp-oauth.service';

export class ApproveMcpRequestDto {
  @IsIn(['read', 'drafts'])
  access: McpAccess;
}

/** The consent screen: the signed-in person answers an AI app's connection request. */
@ApiTags('AI apps (MCP)')
@ApiBearerAuth()
@Controller('mcp-oauth/requests')
@UseGuards(JwtAuthGuard)
export class McpConsentController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get(':requestId')
  view(
    @CurrentUser() user: ConsentUser,
    @Param('requestId') requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.oauth.viewRequest(requestId, user);
  }

  @Post(':requestId/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: ConsentUser,
    @Param('requestId') requestId: string,
    @Body() dto: ApproveMcpRequestDto,
  ): Promise<{ redirectUrl: string }> {
    return this.oauth.approve(requestId, user, dto.access);
  }

  @Post(':requestId/deny')
  @HttpCode(200)
  deny(@Param('requestId') requestId: string): Promise<{ redirectUrl: string }> {
    return this.oauth.deny(requestId);
  }
}

/** Settings → AI: the AI apps connected to this organization. */
@ApiTags('AI apps (MCP)')
@ApiBearerAuth()
@Controller('mcp-connections')
@UseGuards(JwtAuthGuard)
export class McpConnectionsController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get()
  list(@CurrentUser() user: ConsentUser): Promise<Record<string, unknown>> {
    return this.oauth.listConnections(user);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() user: ConsentUser, @Param('id') id: string): Promise<{ revoked: true }> {
    return this.oauth.revokeConnection(user, id);
  }
}
