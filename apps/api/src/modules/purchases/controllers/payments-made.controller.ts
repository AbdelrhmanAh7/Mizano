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
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.paymentsMadeService.create(orgId, dto);
  }

  @Get()
  @Permissions('purchases.view')
  @CacheResponse('payments-made:list')
  @CacheTTL(120)
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.paymentsMadeService.findAll(orgId, query);
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
}
