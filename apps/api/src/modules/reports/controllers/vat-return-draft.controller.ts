import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { VatReturnDraftService } from '../services/vat-return-draft.service';
import { VatReturnDraftQueryDto } from '../dto/vat-return-draft-query.dto';
import { RecordVatFilingCorrectionDto } from '../dto/vat-filing-correction.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VatReturnDraftController {
  constructor(private readonly vatReturnDraftService: VatReturnDraftService) {}

  @Get('vat-return-draft')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'Get VAT return draft for a period' })
  getVatReturnDraft(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Query() query: VatReturnDraftQueryDto,
  ) {
    if (new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('from date must be before or equal to to date');
    }
    return this.vatReturnDraftService.getDraft(orgId, query.from, query.to, userId);
  }

  @Post('vat-return-draft/corrections')
  @Permissions('tax.manage')
  @ApiOperation({ summary: 'Record a VAT return filing correction or amendment for a period' })
  recordCorrection(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RecordVatFilingCorrectionDto,
  ) {
    return this.vatReturnDraftService.recordCorrection(orgId, userId, dto);
  }

  @Get('vat-filing-corrections-metric')
  @Permissions('reports.view')
  @ApiOperation({
    summary:
      'Measure reduction in VAT filing corrections comparing draft-assisted vs unassisted periods',
  })
  getFilingCorrectionsMetric(@CurrentOrg() orgId: string) {
    return this.vatReturnDraftService.getFilingCorrectionsMetric(orgId);
  }
}
