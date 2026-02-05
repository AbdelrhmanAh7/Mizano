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
import { CustomersService } from '../services/customers.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Create a new customer' })
  create(@CurrentOrg() orgId: string, @Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(orgId, createCustomerDto);
  }

  @Get()
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get all customers' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.customersService.findAll(orgId, query);
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
  getStatement(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.customersService.getStatement(orgId, id);
  }

  @Patch(':id')
  @Permissions('sales.edit')
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
  @ApiOperation({ summary: 'Delete customer' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.customersService.remove(orgId, id);
  }
}
