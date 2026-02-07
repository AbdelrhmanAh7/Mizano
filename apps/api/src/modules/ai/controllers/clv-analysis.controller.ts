import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ClvAnalysisService } from '../services/clv-analysis.service';

@ApiTags('AI - Customer Lifetime Value')
@ApiBearerAuth()
@Controller('ai/clv')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClvAnalysisController {
  constructor(private clvService: ClvAnalysisService) {}

  @Get('customer/:id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Calculate CLV for a customer' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  async getCustomerCLV(@CurrentOrg() orgId: string, @Param('id') customerId: string) {
    const result = await this.clvService.calculateCLV(orgId, customerId);
    return { data: result };
  }

  @Get('segments')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get customer segments by CLV' })
  async getSegments(@CurrentOrg() orgId: string) {
    const result = await this.clvService.getSegments(orgId);
    return { data: result };
  }

  @Get('distribution')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get CLV distribution statistics' })
  async getDistribution(@CurrentOrg() orgId: string) {
    const result = await this.clvService.getDistribution(orgId);
    return { data: result };
  }

  @Post('calculate-all')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Calculate CLV for all customers' })
  async calculateAll(@CurrentOrg() orgId: string) {
    const result = await this.clvService.calculateAllCLV(orgId);
    return { data: result };
  }
}
