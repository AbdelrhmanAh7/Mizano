import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { TransactionCategorizerService } from '../services/transaction-categorizer.service';
import {
  PredictCategorizationDto,
  LearnCategorizationDto,
  CategorizationPredictionResponse,
  CategorizationStatsResponse,
  TrainCategorizationResponse,
  SeedCategorizationResponse,
} from '../dto/categorization.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/categorization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategorizationController {
  constructor(private categorizerService: TransactionCategorizerService) {}

  @Post('predict')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get AI category prediction for a transaction' })
  @ApiResponse({
    status: 200,
    description: 'Returns predicted account with confidence and alternatives',
    type: CategorizationPredictionResponse,
  })
  async predict(
    @CurrentOrg() orgId: string,
    @Body() dto: PredictCategorizationDto,
  ): Promise<{ data: CategorizationPredictionResponse }> {
    const prediction = await this.categorizerService.predict(orgId, {
      description: dto.description,
      vendorName: dto.vendorName,
      amount: dto.amount,
      direction: dto.direction,
    });

    return { data: prediction };
  }

  @Post('learn')
  @Permissions('accounting.create')
  @ApiOperation({ summary: 'Submit categorization for learning' })
  @ApiResponse({
    status: 200,
    description: 'Categorization recorded for learning',
  })
  async learn(
    @CurrentOrg() orgId: string,
    @Body() dto: LearnCategorizationDto,
  ): Promise<{ message: string }> {
    await this.categorizerService.onUserCategorize(
      orgId,
      {
        description: dto.description,
        vendorName: dto.vendorName,
        amount: dto.amount,
        direction: dto.direction,
      },
      dto.selectedAccountId,
      dto.wasAiSuggested,
      dto.aiSuggestedAccountId,
    );

    return { message: 'Categorization recorded for learning' };
  }

  @Post('train')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Train or retrain the categorization model' })
  @ApiResponse({
    status: 200,
    description: 'Model trained successfully',
    type: TrainCategorizationResponse,
  })
  async train(@CurrentOrg() orgId: string): Promise<{ data: TrainCategorizationResponse }> {
    const result = await this.categorizerService.train(orgId);
    return { data: result };
  }

  @Get('stats')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get categorization model statistics' })
  @ApiResponse({
    status: 200,
    description: 'Returns model statistics',
    type: CategorizationStatsResponse,
  })
  async getStats(@CurrentOrg() orgId: string): Promise<{ data: CategorizationStatsResponse }> {
    const stats = await this.categorizerService.getStats(orgId);
    return { data: stats };
  }

  @Post('seed')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Seed training data from historical transactions' })
  @ApiResponse({
    status: 200,
    description: 'Training data seeded from history',
    type: SeedCategorizationResponse,
  })
  async seed(@CurrentOrg() orgId: string): Promise<{ data: SeedCategorizationResponse }> {
    const result = await this.categorizerService.seedFromHistory(orgId);
    return { data: result };
  }

  @Post('cross-validate')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Run cross-validation on current training data' })
  @ApiResponse({
    status: 200,
    description: 'Cross-validation results',
  })
  async crossValidate(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: { avgAccuracy: number; foldResults: number[] } }> {
    const result = await this.categorizerService.crossValidate(orgId);
    return { data: result };
  }
}
