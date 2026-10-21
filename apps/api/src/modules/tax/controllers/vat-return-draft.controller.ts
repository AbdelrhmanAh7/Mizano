import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { VatReturnDraftQueryDto } from '../dto/vat-return-query.dto';
import { VatReturnsService } from '../services/vat-returns.service';

@ApiTags('Tax')
@ApiBearerAuth()
@Controller('tax/vat-returns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VatReturnDraftController {
  constructor(private readonly vatReturnsService: VatReturnsService) {}

  @Get('draft')
  @Permissions('tax.view')
  @ApiOperation({ summary: 'Compute VAT return draft from the ledger' })
  draft(@CurrentOrg() orgId: string, @Query() query: VatReturnDraftQueryDto) {
    return this.vatReturnsService.computeDraftFromLedger(orgId, query.periodStart, query.periodEnd);
  }
}
