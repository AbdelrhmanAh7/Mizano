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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  HttpCache,
  InvalidateCache,
  Permissions,
} from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { AccountsService } from '../services/accounts.service';

@ApiTags('Accounts (Chart of Accounts)')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Permissions('accounting.create')
  @InvalidateCache('accounts:*', 'dashboard:*', 'reports:*')
  @ApiOperation({ summary: 'Create a new account' })
  create(@CurrentOrg() orgId: string, @Body() createAccountDto: CreateAccountDto) {
    return this.accountsService.create(orgId, createAccountDto);
  }

  @Post('seed-defaults')
  @Permissions('accounting.create')
  @InvalidateCache('accounts:*', 'dashboard:*', 'reports:*')
  @ApiOperation({ summary: 'Seed default chart of accounts for services industry' })
  seedDefaults(@CurrentOrg() orgId: string) {
    return this.accountsService.seedDefaultAccounts(orgId);
  }

  @Post('seed/:industry')
  @Permissions('accounting.create')
  @InvalidateCache('accounts:*', 'dashboard:*', 'reports:*')
  @ApiOperation({ summary: 'Seed chart of accounts by industry (services, retail, construction)' })
  seedByIndustry(
    @CurrentOrg() orgId: string,
    @Param('industry') industry: 'services' | 'retail' | 'construction',
  ) {
    return this.accountsService.seedIndustryAccounts(orgId, industry);
  }

  @Get()
  @Permissions('accounting.view')
  @CacheResponse('accounts:list')
  @CacheTTL(600)
  @HttpCache('static')
  @ApiOperation({ summary: 'Get all accounts (flat list)' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.accountsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'List accounts with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.accountsService.findAllCursor(orgId, query);
  }

  @Get('tree')
  @Permissions('accounting.view')
  @CacheResponse('accounts:tree')
  @CacheTTL(600)
  @ApiOperation({ summary: 'Get accounts as tree structure' })
  getTree(@CurrentOrg() orgId: string) {
    return this.accountsService.getTree(orgId);
  }

  @Get('by-type/:type')
  @Permissions('accounting.view')
  @CacheResponse('accounts:by-type')
  @CacheTTL(600)
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
  @InvalidateCache('accounts:*', 'dashboard:*', 'reports:*')
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
  @InvalidateCache('accounts:*', 'dashboard:*', 'reports:*')
  @ApiOperation({ summary: 'Delete account' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.accountsService.remove(orgId, id);
  }
}
