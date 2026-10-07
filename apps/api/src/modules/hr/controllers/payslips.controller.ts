import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PayslipPdfService } from '../services/payslip-pdf.service';

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payslips')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayslipsController {
  constructor(private readonly payslipPdfService: PayslipPdfService) {}

  @Get(':id/pdf')
  @Permissions('payroll.view')
  @ApiOperation({ summary: 'Generate payslip PDF (deterministic Arabic/English export)' })
  @ApiParam({ name: 'id', description: 'Payslip ID' })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['ar', 'en'],
    description: 'PDF language: "ar" (default) or "en"',
  })
  @ApiResponse({ status: 200, description: 'Deterministic payslip PDF file' })
  @ApiResponse({ status: 400, description: 'Unsupported language' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Payslip not found' })
  @ApiResponse({ status: 422, description: 'Missing required data' })
  async getPdf(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Query('lang') lang: string = 'ar',
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.payslipPdfService.generatePayslipPdf(orgId, id, lang);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }
}
