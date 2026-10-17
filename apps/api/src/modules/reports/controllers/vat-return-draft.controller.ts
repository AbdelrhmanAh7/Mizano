import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
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
    if (new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('from date must be before or equal to to date');
    }
    return this.vatReturnDraftService.getDraft(orgId, query.from, query.to);
  }
}
