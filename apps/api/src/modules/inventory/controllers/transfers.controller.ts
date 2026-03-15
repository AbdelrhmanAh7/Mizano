import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TransferCursorQueryDto } from '../dto/transfer-cursor-query.dto';
import { CreateTransferData, TransfersService } from '../services/transfers.service';

@ApiTags('Inventory Transfers')
@ApiBearerAuth()
@Controller('transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a stock transfer' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateTransferData) {
    return this.transfersService.create(orgId, dto);
  }

  @Get()
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List stock transfers' })
  findAll(
    @CurrentOrg() orgId: string,
    @Query()
    query: PaginationDto & { status?: string; fromWarehouseId?: string; toWarehouseId?: string },
  ) {
    return this.transfersService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List transfers with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: TransferCursorQueryDto) {
    return this.transfersService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get a stock transfer by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.transfersService.findOne(orgId, id);
  }

  @Patch(':id/in-transit')
  @Permissions('inventory.edit')
  @ApiOperation({ summary: 'Mark a stock transfer as in-transit' })
  markInTransit(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.transfersService.markInTransit(orgId, id);
  }

  @Patch(':id/complete')
  @Permissions('inventory.edit')
  @ApiOperation({ summary: 'Complete a stock transfer' })
  complete(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.transfersService.complete(orgId, id);
  }

  @Patch(':id/cancel')
  @Permissions('inventory.edit')
  @ApiOperation({ summary: 'Cancel a stock transfer' })
  cancel(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.transfersService.cancel(orgId, id);
  }
}
