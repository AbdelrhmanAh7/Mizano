import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, InvalidatesLedger, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { AdjustmentCursorQueryDto, AdjustmentQueryDto } from '../dto/adjustment-query.dto';
import { CreateAdjustmentDto } from '../dto/create-adjustment.dto';
import { AdjustmentsService } from '../services/adjustments.service';

@ApiTags('Inventory Adjustments')
@ApiBearerAuth()
@Controller('inventory-adjustments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class AdjustmentsController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {}

  @Post()
  @Permissions('inventory.create')
  @InvalidatesLedger('items:*', 'inventory:*')
  @ApiOperation({ summary: 'Adjust stock and post the valuation journal' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateAdjustmentDto) {
    return this.adjustmentsService.create(orgId, dto);
  }

  @Get()
  @Permissions('inventory.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: AdjustmentQueryDto) {
    return this.adjustmentsService.findAll(orgId, query);
  }

  @Get('account-options')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Accounts that can take the other side of an adjustment' })
  accountOptions(@CurrentOrg() orgId: string) {
    return this.adjustmentsService.accountOptions(orgId);
  }

  @Get('cursor')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List adjustments with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: AdjustmentCursorQueryDto) {
    return this.adjustmentsService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('inventory.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.adjustmentsService.findOne(orgId, id);
  }

  @Post(':id/void')
  @Permissions('inventory.delete')
  @InvalidatesLedger('items:*', 'inventory:*')
  @ApiOperation({ summary: 'Void an adjustment (restores stock, reverses its journal)' })
  void(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.adjustmentsService.void(orgId, id);
  }
}
