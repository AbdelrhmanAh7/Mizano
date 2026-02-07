import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { DynamicPricingService } from '../services/dynamic-pricing.service';

@ApiTags('AI - Dynamic Pricing')
@ApiBearerAuth()
@Controller('ai/pricing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DynamicPricingController {
  constructor(private pricingService: DynamicPricingService) {}

  @Get('item/:id/elasticity')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Estimate price elasticity for an item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  async getElasticity(@CurrentOrg() orgId: string, @Param('id') itemId: string) {
    const result = await this.pricingService.estimateElasticity(orgId, itemId);
    return { data: result };
  }

  @Get('item/:id/suggest')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get price suggestion for an item' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  @ApiQuery({ name: 'targetMargin', required: false })
  async getSuggestion(@CurrentOrg() orgId: string, @Param('id') itemId: string, @Query('targetMargin') targetMargin?: number) {
    const result = await this.pricingService.suggestPrice(orgId, itemId, targetMargin);
    return { data: result };
  }

  @Get('insights')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get pricing insights for all items' })
  async getInsights(@CurrentOrg() orgId: string) {
    const result = await this.pricingService.getPricingInsights(orgId);
    return { data: result };
  }

  @Post('analyze-all')
  @Permissions('inventory.manage')
  @ApiOperation({ summary: 'Analyze pricing for all items' })
  async analyzeAll(@CurrentOrg() orgId: string) {
    const result = await this.pricingService.analyzeAllPricing(orgId);
    return { data: result };
  }
}
