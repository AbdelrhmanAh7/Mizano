import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkOrdersService } from '../services/work-orders.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Work Orders')
@ApiBearerAuth()
@Controller('work-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  @Permissions('manufacturing.create')
  @ApiOperation({ summary: 'Create a new work order' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.workOrdersService.create(orgId, dto);
  }

  @Get()
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get all work orders' })
  findAll(@CurrentOrg() orgId: string, @Query() query: { status?: string; bomId?: string }) {
    return this.workOrdersService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get work order by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.workOrdersService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Update work order' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.workOrdersService.update(orgId, id, dto);
  }

  @Post(':id/start')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Start work order' })
  start(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.workOrdersService.startWorkOrder(orgId, id);
  }

  @Get(':id/availability')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Check material availability' })
  checkAvailability(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.workOrdersService.checkMaterialAvailability(orgId, id);
  }

  @Post(':id/production')
  @Permissions('manufacturing.create')
  @ApiOperation({ summary: 'Record production entry' })
  recordProduction(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.workOrdersService.recordProduction(orgId, id, dto);
  }

  @Get(':id/history')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get production history' })
  getHistory(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.workOrdersService.getProductionHistory(orgId, id);
  }

  @Post(':id/complete')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Complete work order and record COGM' })
  complete(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: { quantityProduced: number; notes?: string }) {
    return this.workOrdersService.completeWorkOrder(orgId, id, dto);
  }

  @Post(':id/cancel')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Cancel work order' })
  cancel(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: { reason: string }) {
    return this.workOrdersService.cancelWorkOrder(orgId, id, dto.reason);
  }

  @Delete(':id')
  @Permissions('manufacturing.delete')
  @ApiOperation({ summary: 'Delete work order' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.workOrdersService.remove(orgId, id);
  }
}
