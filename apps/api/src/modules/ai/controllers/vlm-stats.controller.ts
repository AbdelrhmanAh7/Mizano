import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { VlmFeedbackService } from '../services/vlm-feedback.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/vlm-stats')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VlmStatsController {
  constructor(private vlmFeedbackService: VlmFeedbackService) {}

  @Get()
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Get VLM extraction accuracy statistics' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to aggregate (default 30)',
  })
  async getStats(@CurrentOrg() orgId: string, @Query('days') days?: string) {
    return {
      data: await this.vlmFeedbackService.getAccuracyStats(orgId, days ? parseInt(days, 10) : 30),
    };
  }
}
