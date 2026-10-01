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
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  InvalidatesLedger,
  Permissions,
} from '../../../common/decorators';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaymentReceivedQueryDto } from '../dto/payment-received-query.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreatePaymentReceivedDto } from '../dto/create-payment-received.dto';
import { PaymentsReceivedService } from '../services/payments-received.service';

@ApiTags('Payments Received')
@ApiBearerAuth()
@Controller('payments-received')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class PaymentsReceivedController {
  constructor(private readonly paymentsReceivedService: PaymentsReceivedService) {}

  @Post()
  @Permissions('sales.create')
  @InvalidatesLedger('payments-received:*', 'invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Record a payment received (allocations + journal)' })
  create(@CurrentOrg() orgId: string, @Body() createPaymentReceivedDto: CreatePaymentReceivedDto) {
    return this.paymentsReceivedService.create(orgId, createPaymentReceivedDto);
  }

  @Get()
  @Permissions('sales.view')
  @CacheResponse('payments-received:list')
  @CacheTTL(120)
  findAll(@CurrentOrg() orgId: string, @Query() query: PaymentReceivedQueryDto) {
    return this.paymentsReceivedService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'List payments received with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.paymentsReceivedService.findAllCursor(orgId, query);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @InvalidatesLedger('payments-received:*', 'invoices:*', 'customers:*')
  @ApiOperation({
    summary: 'Bulk void payments received (restores invoice balances, reverses journals)',
  })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.paymentsReceivedService.bulkDelete(orgId, dto.ids);
  }

  @Get(':id')
  @Permissions('sales.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.paymentsReceivedService.findOne(orgId, id);
  }

  @Post(':id/void')
  @Permissions('sales.delete')
  @InvalidatesLedger('payments-received:*', 'invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Void a payment (restores invoice balances, reverses journal)' })
  void(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.paymentsReceivedService.void(orgId, id);
  }
}
