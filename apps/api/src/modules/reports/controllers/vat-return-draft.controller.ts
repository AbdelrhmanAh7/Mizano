import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { VatReturnDraftService } from '../services/vat-return-draft.service';
import { VatReturnDraftQueryDto } from '../dto/vat-return-draft-query.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports/vat-return-draft')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VatReturnDraftController {
  constructor(private readonly vatReturnDraftService: VatReturnDraftService) {}

  @Get()
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get VAT return draft for a period' })
  getVatReturnDraft(@CurrentOrg() orgId: string, @Query() query: VatReturnDraftQueryDto) {
    // Date-order validation is handled by VatReturnDraftService.resolveRange
    // using UTC calendar-day comparison, which correctly accepts same-day timestamps.
    return this.vatReturnDraftService.getDraft(orgId, query.from, query.to);
  }
}
