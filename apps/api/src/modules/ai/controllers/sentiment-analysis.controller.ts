import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
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
import {
  SentimentAnalysisService,
  EntityType,
  TrendPeriod,
} from '../services/sentiment-analysis.service';
import {
  AnalyzeTextDto,
  SentimentResultDto,
  CustomerSentimentDto,
  SentimentTrendDto,
} from '../dto/sentiment-analysis.dto';

@ApiTags('AI - Sentiment Analysis')
@ApiBearerAuth()
@Controller('ai/sentiment')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SentimentAnalysisController {
  constructor(private sentimentAnalysisService: SentimentAnalysisService) {}

  @Post('analyze')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Analyze sentiment of a text' })
  @ApiResponse({
    status: 200,
    description: 'Returns sentiment analysis result',
    type: SentimentResultDto,
  })
  async analyzeText(@Body() body: AnalyzeTextDto) {
    const result = await this.sentimentAnalysisService.analyzeText(body.text);
    return { data: result };
  }

  @Get('customer/:customerId')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get sentiment analysis for a customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns customer sentiment overview',
    type: CustomerSentimentDto,
  })
  async analyzeCustomerSentiment(
    @CurrentOrg() orgId: string,
    @Param('customerId') customerId: string,
  ) {
    const result = await this.sentimentAnalysisService.analyzeCustomerSentiment(orgId, customerId);
    return { data: result };
  }

  @Get('vendor/:vendorId')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get sentiment analysis for a vendor' })
  @ApiParam({ name: 'vendorId', description: 'Vendor ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns vendor sentiment overview',
    type: CustomerSentimentDto,
  })
  async analyzeVendorSentiment(@CurrentOrg() orgId: string, @Param('vendorId') vendorId: string) {
    const result = await this.sentimentAnalysisService.analyzeVendorSentiment(orgId, vendorId);
    return { data: result };
  }

  @Get('trends')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get sentiment trends over time' })
  @ApiQuery({
    name: 'entityType',
    description: 'Entity type to analyze (customer, vendor)',
    required: false,
    enum: ['customer', 'vendor'],
  })
  @ApiQuery({
    name: 'period',
    description: 'Time period for trends (monthly, quarterly, yearly)',
    required: false,
    enum: ['monthly', 'quarterly', 'yearly'],
  })
  @ApiResponse({
    status: 200,
    description: 'Returns sentiment trends',
    type: [SentimentTrendDto],
  })
  async getSentimentTrends(
    @CurrentOrg() orgId: string,
    @Query('entityType') entityType?: string,
    @Query('period') period?: string,
  ) {
    const trends = await this.sentimentAnalysisService.getSentimentTrends(
      orgId,
      (entityType || 'customer') as EntityType,
      (period || 'monthly') as TrendPeriod,
    );
    return { data: trends };
  }
}
