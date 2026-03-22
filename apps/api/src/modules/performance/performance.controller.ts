import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  DatabaseHealthDto,
  IndexRecommendationDto,
  QueryDistributionItemDto,
  QueryMetricsQueryDto,
  QueryStatsResponseDto,
  TimeTrendItemDto,
  TimeTrendQueryDto,
} from './dto/query-metrics.dto';
import { IndexAdvisorService } from './services/index-advisor.service';
import { QueryMetricsService } from './services/query-metrics.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceController {
  constructor(
    private readonly queryMetricsService: QueryMetricsService,
    private readonly indexAdvisorService: IndexAdvisorService,
  ) {}

  @Get('slow-queries')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Get paginated list of slow queries' })
  @ApiResponse({ status: 200, description: 'Slow queries list' })
  getSlowQueries(@Query() query: QueryMetricsQueryDto) {
    return this.queryMetricsService.getSlowQueries({
      threshold: query.threshold,
      model: query.model,
      action: query.action,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('stats')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Get aggregate query statistics' })
  @ApiResponse({ status: 200, type: QueryStatsResponseDto })
  getStats(): QueryStatsResponseDto {
    return this.queryMetricsService.getStats();
  }

  @Get('distribution')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Get query distribution by model' })
  @ApiResponse({ status: 200, type: [QueryDistributionItemDto] })
  getDistribution(): QueryDistributionItemDto[] {
    return this.queryMetricsService.getDistribution();
  }

  @Get('trend')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Get response time trend' })
  @ApiResponse({ status: 200, type: [TimeTrendItemDto] })
  getTrend(@Query() query: TimeTrendQueryDto): TimeTrendItemDto[] {
    return this.queryMetricsService.getTrend(query.interval || 5);
  }

  @Get('health')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Get database health status' })
  @ApiResponse({ status: 200, type: DatabaseHealthDto })
  async getHealth(): Promise<DatabaseHealthDto> {
    return this.queryMetricsService.getHealth();
  }

  @Get('index-recommendations')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Get AI-powered index recommendations' })
  @ApiResponse({ status: 200, type: [IndexRecommendationDto] })
  getIndexRecommendations(): IndexRecommendationDto[] {
    return this.indexAdvisorService.getRecommendations();
  }

  @Post('reset')
  @Permissions('settings.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset query metrics buffer' })
  @ApiResponse({ status: 200, description: 'Metrics reset successfully' })
  resetMetrics(): { message: string } {
    return this.queryMetricsService.resetMetrics();
  }
}
