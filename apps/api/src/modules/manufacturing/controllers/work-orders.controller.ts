import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, InvalidatesLedger, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import {
  CreateWorkOrderData,
  UpdateWorkOrderData,
  WorkOrdersService,
} from '../services/work-orders.service';

@ApiTags('Work Orders')
@ApiBearerAuth()
@Controller('manufacturing/work-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  @Permissions('manufacturing.create')
  @ApiOperation({ summary: 'Create a new work order' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateWorkOrderData) {
    return this.workOrdersService.create(orgId, dto);
  }

  @Get()
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get all work orders' })
  findAll(
    @CurrentOrg() orgId: string,
    @Query()
    query: {
      page?: number | string;
      limit?: number | string;
      sortBy?: string;
      sortOrder?: string;
      status?: string;
      bomId?: string;
    },
  ) {
    return this.workOrdersService.findAll(orgId, query);
  }

  @Get('stats')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get manufacturing dashboard stats' })
  getStats(@CurrentOrg() orgId: string) {
    return this.workOrdersService.getStats(orgId);
  }

  @Get(':id')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get work order by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.workOrdersService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Update work order' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateWorkOrderData) {
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
  recordProduction(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { quantityProduced: number; notes?: string },
  ) {
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
  @InvalidatesLedger('inventory:*', 'items:*')
  @ApiOperation({ summary: 'Complete work order and record COGM' })
  complete(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { quantityProduced: number; notes?: string },
  ) {
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

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('manufacturing.delete')
  @ApiOperation({ summary: 'Bulk delete draft work orders' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.workOrdersService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-start')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Bulk start work orders' })
  bulkStart(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.workOrdersService.bulkStart(orgId, dto.ids);
  }

  @Post('bulk-complete')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Bulk complete work orders' })
  bulkComplete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.workOrdersService.bulkComplete(orgId, dto.ids);
  }

  @Post('bulk-cancel')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Bulk cancel work orders' })
  bulkCancel(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.workOrdersService.bulkCancel(orgId, dto.ids);
  }
}
