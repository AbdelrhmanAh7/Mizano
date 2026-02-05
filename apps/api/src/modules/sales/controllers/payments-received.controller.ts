import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsReceivedService } from '../services/payments-received.service';
import { CreatePaymentReceivedDto } from '../dto/create-payment-received.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Payments Received')
@ApiBearerAuth()
@Controller('payments-received')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsReceivedController {
  constructor(private readonly paymentsReceivedService: PaymentsReceivedService) {}

  @Post()
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Record a payment received' })
  create(@CurrentOrg() orgId: string, @Body() createPaymentReceivedDto: CreatePaymentReceivedDto) {
    return this.paymentsReceivedService.create(orgId, createPaymentReceivedDto);
  }

  @Get()
  @Permissions('sales.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.paymentsReceivedService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('sales.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.paymentsReceivedService.findOne(orgId, id);
  }
}
