import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExpensesService } from '../services/expenses.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post() @Permissions('purchases.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.expensesService.create(orgId, dto); }

  @Get() @Permissions('purchases.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) { return this.expensesService.findAll(orgId, query); }

  @Get(':id') @Permissions('purchases.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.expensesService.findOne(orgId, id); }
}
