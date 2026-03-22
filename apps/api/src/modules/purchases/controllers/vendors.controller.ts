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
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';
import { VendorsService } from '../services/vendors.service';

@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @Permissions('purchases.create')
  @InvalidateCache('vendors:*')
  create(@CurrentOrg() orgId: string, @Body() dto: CreateVendorDto) {
    return this.vendorsService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('vendors:list')
  @CacheTTL(120)
  @HttpCache('short')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.vendorsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'List vendors with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.vendorsService.findAllCursor(orgId, query);
  }

  @Post('bulk-delete')
  @Permissions('purchases.delete')
  @InvalidateCache('vendors:*')
  @ApiOperation({ summary: 'Bulk delete vendors' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.vendorsService.bulkDelete(orgId, dto.ids);
  }

  @Get(':id')
  @Permissions('purchases.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vendorsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('purchases.edit')
  @InvalidateCache('vendors:*')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendorsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('purchases.delete')
  @InvalidateCache('vendors:*')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.vendorsService.remove(orgId, id);
  }
}
