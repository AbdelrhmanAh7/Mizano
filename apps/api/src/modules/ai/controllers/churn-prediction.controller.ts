import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ChurnPredictionService } from '../services/churn-prediction.service';

@ApiTags('AI - Churn Prediction')
@ApiBearerAuth()
@Controller('ai/churn')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChurnPredictionController {
  constructor(private churnService: ChurnPredictionService) {}

  @Get('customer/:id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Predict churn risk for a customer' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  async predictChurn(@CurrentOrg() orgId: string, @Param('id') customerId: string) {
    const result = await this.churnService.predictChurnRisk(orgId, customerId);
    return { data: result };
  }

  @Get('high-risk')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get high-risk customers' })
  @ApiQuery({ name: 'limit', required: false })
  async getHighRisk(@CurrentOrg() orgId: string, @Query('limit') limit?: number) {
    const result = await this.churnService.getHighRiskCustomers(orgId, limit || 20);
    return { data: result };
  }

  @Post('predict-all')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Batch predict churn for all customers' })
  async predictAll(@CurrentOrg() orgId: string) {
    const result = await this.churnService.predictAllCustomers(orgId);
    return { data: result };
  }

  @Post('train')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Train churn prediction ML model' })
  async train(@CurrentOrg() orgId: string) {
    const result = await this.churnService.trainModel(orgId);
    return { data: result };
  }
}
