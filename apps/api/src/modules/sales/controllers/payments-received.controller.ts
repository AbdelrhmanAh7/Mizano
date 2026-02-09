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
  InvalidateCache,
  Permissions,
} from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
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
  @InvalidateCache('payments-received:*', 'invoices:*')
  @ApiOperation({ summary: 'Record a payment received' })
  create(@CurrentOrg() orgId: string, @Body() createPaymentReceivedDto: CreatePaymentReceivedDto) {
    return this.paymentsReceivedService.create(orgId, createPaymentReceivedDto);
  }

  @Get()
  @Permissions('sales.view')
  @CacheResponse('payments-received:list')
  @CacheTTL(120)
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.paymentsReceivedService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'List payments received with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.paymentsReceivedService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('sales.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.paymentsReceivedService.findOne(orgId, id);
  }
}
