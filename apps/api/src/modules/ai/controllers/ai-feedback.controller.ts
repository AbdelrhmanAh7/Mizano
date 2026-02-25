import { Controller, Post, Get, Body, Query, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { ModelRegistryService } from '../services/model-registry.service';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';
import { AiFeature } from '@prisma/client';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/feedback')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiFeedbackController {
  constructor(
    private feedbackService: AiFeedbackService,
    private modelRegistry: ModelRegistryService,
  ) {}

  @Post()
  @Permissions('ai.feedback')
  @ApiOperation({ summary: 'Submit feedback for an AI prediction' })
  @ApiResponse({ status: 201, description: 'Feedback submitted successfully' })
  submitFeedback(@CurrentOrg() orgId: string, @Body() dto: SubmitFeedbackDto) {
    return this.feedbackService.processFeedback(orgId, dto);
  }

  @Get('stats')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get feedback statistics for a feature' })
  getFeedbackStats(
    @CurrentOrg() orgId: string,
    @Query('feature') feature: AiFeature,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.feedbackService.getFeedbackStats(orgId, feature, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('trends/:feature')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get feedback trends over time' })
  getFeedbackTrends(
    @CurrentOrg() orgId: string,
    @Param('feature') feature: AiFeature,
    @Query('days') days?: number,
  ) {
    return this.feedbackService.getFeedbackTrends(orgId, feature, days || 30);
  }

  @Get('recent/:feature')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get recent feedback for a feature' })
  getRecentFeedback(
    @CurrentOrg() orgId: string,
    @Param('feature') feature: AiFeature,
    @Query('limit') limit?: number,
  ) {
    return this.feedbackService.getRecentFeedback(orgId, feature, limit || 50);
  }

  @Get('models/:feature/status')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get model status for a feature' })
  getModelStatus(@CurrentOrg() orgId: string, @Param('feature') feature: AiFeature) {
    return this.modelRegistry.getModelStatus(orgId, feature);
  }

  @Get('models/:feature/history')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get model version history' })
  getModelHistory(
    @CurrentOrg() orgId: string,
    @Param('feature') feature: AiFeature,
    @Query('limit') limit?: number,
  ) {
    return this.modelRegistry.getModelHistory(orgId, feature, limit);
  }

  @Post('models/:feature/retrain')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Trigger retraining for a feature' })
  async triggerRetraining(@CurrentOrg() orgId: string, @Param('feature') feature: AiFeature) {
    const { shouldRetrain, correctionCount, threshold } =
      await this.feedbackService.checkRetrainingThreshold(orgId, feature);

    return {
      triggered: true,
      correctionCount,
      threshold,
      shouldRetrain,
      message: shouldRetrain ? 'Retraining queued' : 'Retraining not needed yet',
    };
  }
}
