import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TelegramLinkService } from './telegram-link.service';

@ApiTags('Telegram')
@ApiBearerAuth()
@Controller('telegram')
@UseGuards(JwtAuthGuard, OrganizationGuard, PermissionsGuard)
export class TelegramController {
  constructor(private readonly links: TelegramLinkService) {}

  /** Generates a one-time code; the user sends `/link <code>` to the bot. */
  @Post('link-code')
  @Permissions('settings.edit')
  async createLinkCode(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ data: { code: string; expiresAt: Date; command: string } }> {
    const { code, expiresAt } = await this.links.createCode(orgId, userId);
    return { data: { code, expiresAt, command: `/link ${code}` } };
  }

  @Get('links')
  @Permissions('settings.view')
  async listLinks(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: { id: string; chatId: string; createdAt: Date }[] }> {
    const rows = await this.links.list(orgId);
    return { data: rows.map((r) => ({ id: r.id, chatId: r.chatId, createdAt: r.createdAt })) };
  }

  @Delete('links/:id')
  @HttpCode(204)
  @Permissions('settings.edit')
  async unlink(@CurrentOrg() orgId: string, @Param('id') id: string): Promise<void> {
    await this.links.unlink(id, orgId);
  }
}
