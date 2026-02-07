import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { LeadScoringService } from '../services/lead-scoring.service';
import {
  LeadLimitDto,
  LeadScoreResponse,
  HotLeadResponse,
  ColdLeadResponse,
  ConversionPredictionResponse,
  ScoreHistoryEntryResponse,
  ScoreAllResultResponse,
  UpdateScoresResultResponse,
  ScoreDistributionResponse,
} from '../dto/lead-scoring.dto';

@ApiTags('AI - Lead Scoring')
@ApiBearerAuth()
@Controller('ai/lead-scoring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadScoringController {
  constructor(private leadScoringService: LeadScoringService) {}

  @Get('lead/:id')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get lead score and breakdown' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns lead score',
    type: LeadScoreResponse,
  })
  async getLeadScore(
    @CurrentOrg() orgId: string,
    @Param('id') leadId: string,
  ): Promise<{ data: LeadScoreResponse }> {
    const score = await this.leadScoringService.scoreLead(orgId, leadId);
    return { data: score };
  }

  @Post('lead/:id/rescore')
  @Permissions('crm.manage')
  @ApiOperation({ summary: 'Rescore a lead' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns updated lead score',
    type: LeadScoreResponse,
  })
  async rescoreLead(
    @CurrentOrg() orgId: string,
    @Param('id') leadId: string,
  ): Promise<{ data: LeadScoreResponse }> {
    const score = await this.leadScoringService.scoreLead(orgId, leadId);
    return { data: score };
  }

  @Get('hot')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get hot leads' })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of leads',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns hot leads',
    type: [HotLeadResponse],
  })
  async getHotLeads(
    @CurrentOrg() orgId: string,
    @Query() query: LeadLimitDto,
  ): Promise<{ data: HotLeadResponse[] }> {
    const leads = await this.leadScoringService.getHotLeads(
      orgId,
      query.limit || 10,
    );
    return { data: leads };
  }

  @Get('cold')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get cold leads for re-engagement' })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of leads',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns cold leads',
    type: [ColdLeadResponse],
  })
  async getColdLeads(
    @CurrentOrg() orgId: string,
    @Query() query: LeadLimitDto,
  ): Promise<{ data: ColdLeadResponse[] }> {
    const leads = await this.leadScoringService.getColdLeads(
      orgId,
      query.limit || 20,
    );
    return { data: leads };
  }

  @Get('lead/:id/prediction')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get conversion prediction for a lead' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns conversion prediction',
    type: ConversionPredictionResponse,
  })
  async getConversionPrediction(
    @CurrentOrg() orgId: string,
    @Param('id') leadId: string,
  ): Promise<{ data: ConversionPredictionResponse }> {
    const prediction = await this.leadScoringService.getConversionPrediction(
      orgId,
      leadId,
    );
    return { data: prediction };
  }

  @Get('lead/:id/history')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get score history for a lead' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns score history',
    type: [ScoreHistoryEntryResponse],
  })
  async getScoreHistory(
    @CurrentOrg() orgId: string,
    @Param('id') leadId: string,
  ): Promise<{ data: ScoreHistoryEntryResponse[] }> {
    const history = await this.leadScoringService.getLeadScoreHistory(
      orgId,
      leadId,
    );
    return { data: history };
  }

  @Post('score-all')
  @Permissions('crm.manage')
  @ApiOperation({ summary: 'Score all leads in organization' })
  @ApiResponse({
    status: 200,
    description: 'Returns scoring results',
    type: ScoreAllResultResponse,
  })
  async scoreAllLeads(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: ScoreAllResultResponse }> {
    const result = await this.leadScoringService.scoreAllLeads(orgId);
    return { data: result };
  }

  @Get('distribution')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get score distribution across all leads' })
  @ApiResponse({
    status: 200,
    description: 'Returns score distribution',
    type: ScoreDistributionResponse,
  })
  async getScoreDistribution(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: ScoreDistributionResponse }> {
    const distribution = await this.leadScoringService.getScoreDistribution(
      orgId,
    );
    return { data: distribution };
  }

  @Post('train')
  @Permissions('crm.manage')
  @ApiOperation({
    summary: 'Train ML model for lead scoring using historical outcomes',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns training results including accuracy metrics',
  })
  async trainMLModel(@CurrentOrg() orgId: string) {
    const result = await this.leadScoringService.trainMLModel(orgId);
    return { data: result };
  }

  @Get('ml-status')
  @Permissions('crm.view')
  @ApiOperation({ summary: 'Get ML model status for lead scoring' })
  @ApiResponse({
    status: 200,
    description: 'Returns ML model status and metadata',
  })
  async getMLModelStatus(@CurrentOrg() orgId: string) {
    const status = await this.leadScoringService.getMLModelStatus(orgId);
    return { data: status };
  }
}
