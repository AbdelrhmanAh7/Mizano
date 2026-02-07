import { Controller, Get, Post, Body, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BillsService } from '../services/bills.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CheckDuplicateBillDto } from '../dto/check-duplicate-bill.dto';

@ApiTags('Bills')
@ApiBearerAuth()
@Controller('bills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Post('check-duplicate')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Check for potential duplicate bills' })
  checkDuplicate(@CurrentOrg() orgId: string, @Body() dto: CheckDuplicateBillDto) {
    return this.billsService.checkDuplicate(orgId, dto);
  }

  @Post()
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Create a new bill' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.billsService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get all bills' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.billsService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Get bill by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('purchases.edit')
  @ApiOperation({ summary: 'Update bill' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.billsService.update(orgId, id, dto);
  }

  @Post(':id/approve')
  @Permissions('purchases.edit')
  @ApiOperation({ summary: 'Approve bill' })
  approve(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.approve(orgId, id);
  }

  @Delete(':id')
  @Permissions('purchases.delete')
  @ApiOperation({ summary: 'Delete bill' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.billsService.remove(orgId, id);
  }
}
