import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CrossSellService } from '../services/cross-sell.service';

@ApiTags('AI - Cross-sell')
@ApiBearerAuth()
@Controller('ai/cross-sell')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CrossSellController {
  constructor(private crossSellService: CrossSellService) {}

  @Get('customer/:id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get cross-sell recommendations for a customer' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiQuery({ name: 'limit', required: false })
  async getRecommendations(
    @CurrentOrg() orgId: string,
    @Param('id') customerId: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.crossSellService.getRecommendations(orgId, customerId, limit || 5);
    return { data: result };
  }

  @Get('upsell/customer/:id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get upsell recommendations for a customer' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiQuery({ name: 'limit', required: false })
  async getUpsellRecommendations(
    @CurrentOrg() orgId: string,
    @Param('id') customerId: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.crossSellService.getUpsellRecommendations(
      orgId,
      customerId,
      limit || 5,
    );
    return { data: result };
  }

  @Get('item/:id/related')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get frequently bought together items' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  async getRelated(@CurrentOrg() orgId: string, @Param('id') itemId: string) {
    const result = await this.crossSellService.getFrequentlyBoughtTogether(orgId, itemId);
    return { data: result };
  }

  @Post('rebuild-matrix')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Rebuild co-occurrence matrix' })
  async rebuildMatrix(@CurrentOrg() orgId: string) {
    const result = await this.crossSellService.buildCoOccurrenceMatrix(orgId);
    return { data: result };
  }
}
