import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BankAccountsService } from '../services/bank-accounts.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@Controller('bank-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post() @Permissions('banking.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.bankAccountsService.create(orgId, dto); }

  @Get() @Permissions('banking.view')
  findAll(@CurrentOrg() orgId: string) { return this.bankAccountsService.findAll(orgId); }

  @Get(':id') @Permissions('banking.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.bankAccountsService.findOne(orgId, id); }

  @Patch(':id') @Permissions('banking.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) { return this.bankAccountsService.update(orgId, id, dto); }

  @Delete(':id') @Permissions('banking.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.bankAccountsService.remove(orgId, id); }
}
