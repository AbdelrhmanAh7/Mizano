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
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { CustomersService } from '../services/customers.service';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions('sales.create')
  @InvalidateCache('customers:*')
  @ApiOperation({ summary: 'Create a new customer' })
  create(@CurrentOrg() orgId: string, @Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(orgId, createCustomerDto);
  }

  @Get()
  @Permissions('sales.view')
  @CacheResponse('customers:list')
  @CacheTTL(120)
  @HttpCache('short')
  @ApiOperation({ summary: 'Get all customers' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.customersService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'List customers with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.customersService.findAllCursor(orgId, query);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @InvalidateCache('customers:*')
  @ApiOperation({ summary: 'Bulk delete customers' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.customersService.bulkDelete(orgId, dto.ids);
  }

  @Get(':id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get customer by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.customersService.findOne(orgId, id);
  }

  @Get(':id/statement')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get customer statement' })
  getStatement(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.customersService.getStatement(orgId, id, startDate, endDate);
  }

  @Patch(':id')
  @Permissions('sales.edit')
  @InvalidateCache('customers:*')
  @ApiOperation({ summary: 'Update customer' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customersService.update(orgId, id, updateCustomerDto);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @InvalidateCache('customers:*')
  @ApiOperation({ summary: 'Delete customer' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.customersService.remove(orgId, id);
  }
}
