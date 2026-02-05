import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountsService } from '../services/accounts.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Accounts (Chart of Accounts)')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Permissions('accounting.create')
  @ApiOperation({ summary: 'Create a new account' })
  create(@CurrentOrg() orgId: string, @Body() createAccountDto: CreateAccountDto) {
    return this.accountsService.create(orgId, createAccountDto);
  }

  @Post('seed-defaults')
  @Permissions('accounting.create')
  @ApiOperation({ summary: 'Seed default chart of accounts for services industry' })
  seedDefaults(@CurrentOrg() orgId: string) {
    return this.accountsService.seedDefaultAccounts(orgId);
  }

  @Post('seed/:industry')
  @Permissions('accounting.create')
  @ApiOperation({ summary: 'Seed chart of accounts by industry (services, retail, construction)' })
  seedByIndustry(
    @CurrentOrg() orgId: string,
    @Param('industry') industry: 'services' | 'retail' | 'construction',
  ) {
    return this.accountsService.seedIndustryAccounts(orgId, industry);
  }

  @Get()
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get all accounts (flat list)' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.accountsService.findAll(orgId, query);
  }

  @Get('tree')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get accounts as tree structure' })
  getTree(@CurrentOrg() orgId: string) {
    return this.accountsService.getTree(orgId);
  }

  @Get('by-type/:type')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get accounts by type' })
  findByType(@CurrentOrg() orgId: string, @Param('type') type: string) {
    return this.accountsService.findByType(orgId, type);
  }

  @Get(':id')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get account by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.accountsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('accounting.edit')
  @ApiOperation({ summary: 'Update account' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountsService.update(orgId, id, updateAccountDto);
  }

  @Delete(':id')
  @Permissions('accounting.delete')
  @ApiOperation({ summary: 'Delete account' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.accountsService.remove(orgId, id);
  }
}
