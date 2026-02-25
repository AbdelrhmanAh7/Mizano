import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PipelineForecastService } from '../services/pipeline-forecast.service';

@ApiTags('AI - Pipeline Forecast')
@ApiBearerAuth()
@Controller('ai/pipeline')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelineForecastController {
  constructor(private pipelineService: PipelineForecastService) {}

  @Get('forecast')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Forecast pipeline revenue' })
  @ApiQuery({ name: 'months', required: false })
  async getForecast(
    @CurrentOrg() orgId: string,
    @Query('months', new DefaultValuePipe(6), ParseIntPipe) months: number,
  ) {
    const result = await this.pipelineService.forecastPipeline(orgId, months);
    return { data: result };
  }

  @Get('weighted')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get weighted pipeline by stage' })
  async getWeighted(@CurrentOrg() orgId: string) {
    const result = await this.pipelineService.getWeightedPipeline(orgId);
    return { data: result };
  }

  @Get('conversion-rates')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get stage conversion rates' })
  async getConversionRates(@CurrentOrg() orgId: string) {
    const result = await this.pipelineService.getStageConversionRates(orgId);
    return { data: result };
  }

  @Get('deal/:id/timeline')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Forecast deal timeline' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  async getDealTimeline(@CurrentOrg() orgId: string, @Param('id') dealId: string) {
    const result = await this.pipelineService.forecastDealTimeline(orgId, dealId);
    return { data: result };
  }
}
