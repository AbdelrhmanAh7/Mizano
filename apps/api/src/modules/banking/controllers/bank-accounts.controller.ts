import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  InvalidateCache,
  Permissions,
} from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { BankAccountsService } from '../services/bank-accounts.service';
import { CreateBankAccountDto } from '../dto/create-bank-account.dto';
import { UpdateBankAccountDto } from '../dto/update-bank-account.dto';

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@Controller('bank-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  @Permissions('banking.create')
  @InvalidateCache('bank-accounts:*')
  create(@CurrentOrg() orgId: string, @Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.create(orgId, dto);
  }

  @Get()
  @Permissions('banking.view')
  @CacheResponse('bank-accounts:list')
  @CacheTTL(120)
  findAll(@CurrentOrg() orgId: string) {
    return this.bankAccountsService.findAll(orgId);
  }

  @Get(':id')
  @Permissions('banking.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.bankAccountsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('banking.edit')
  @InvalidateCache('bank-accounts:*')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.bankAccountsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('banking.delete')
  @InvalidateCache('bank-accounts:*')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.bankAccountsService.remove(orgId, id);
  }
}
