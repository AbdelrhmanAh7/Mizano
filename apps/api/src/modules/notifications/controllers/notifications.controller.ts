import { Controller, Get, Post, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from '../services/notifications.service';
import { CurrentOrg, CurrentUser, HttpCache } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @HttpCache('realtime')
  @ApiOperation({ summary: 'Get user notifications' })
  findAll(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: any,
    @Query() query: { isRead?: boolean; type?: string },
  ) {
    return this.notificationsService.findAllForUser(orgId, user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentOrg() orgId: string, @CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(orgId, user.id);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@CurrentOrg() orgId: string, @CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(orgId, user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentOrg() orgId: string, @CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(orgId, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  delete(@CurrentOrg() orgId: string, @CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationsService.delete(orgId, user.id, id);
  }

  @Delete('read')
  @ApiOperation({ summary: 'Delete all read notifications' })
  deleteAllRead(@CurrentOrg() orgId: string, @CurrentUser() user: any) {
    return this.notificationsService.deleteAllRead(orgId, user.id);
  }
}
