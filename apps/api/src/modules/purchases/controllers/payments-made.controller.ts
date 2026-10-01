import {
  Body,
  Controller,
  Delete,
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
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreatePaymentMadeDto } from '../dto/create-payment-made.dto';
import { PaymentMadeQueryDto } from '../dto/payment-made-query.dto';
import { PaymentsMadeService } from '../services/payments-made.service';

@ApiTags('Payments Made')
@ApiBearerAuth()
@Controller('payments-made')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class PaymentsMadeController {
  constructor(private readonly paymentsMadeService: PaymentsMadeService) {}

  @Post()
  @Permissions('purchases.create')
  @InvalidateCache('payments-made:*', 'bills:*')
  create(@CurrentOrg() orgId: string, @Body() dto: CreatePaymentMadeDto) {
    return this.paymentsMadeService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('payments-made:list')
  @CacheTTL(120)
  findAll(@CurrentOrg() orgId: string, @Query() query: PaymentMadeQueryDto) {
    return this.paymentsMadeService.findAll(orgId, query);
  }

  @Post('bulk-delete')
  @Permissions('purchases.delete')
  @InvalidateCache('payments-made:*', 'bills:*')
  @ApiOperation({ summary: 'Bulk void payments made (restores bill balances, reverses journals)' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
    return this.paymentsMadeService.bulkDelete(orgId, dto.ids);
  }

  @Get('cursor')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'List payments made with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.paymentsMadeService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('purchases.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.paymentsMadeService.findOne(orgId, id);
  }

  @Delete(':id')
  @Permissions('purchases.delete')
  @InvalidateCache('payments-made:*', 'bills:*')
  @ApiOperation({ summary: 'Void a payment (restores bill balances, reverses journal)' })
  void(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.paymentsMadeService.void(orgId, id);
  }
}
