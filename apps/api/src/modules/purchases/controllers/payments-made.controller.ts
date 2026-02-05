import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsMadeService } from '../services/payments-made.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Payments Made')
@ApiBearerAuth()
@Controller('payments-made')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsMadeController {
  constructor(private readonly paymentsMadeService: PaymentsMadeService) {}

  @Post() @Permissions('purchases.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.paymentsMadeService.create(orgId, dto); }

  @Get() @Permissions('purchases.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) { return this.paymentsMadeService.findAll(orgId, query); }

  @Get(':id') @Permissions('purchases.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.paymentsMadeService.findOne(orgId, id); }
}
