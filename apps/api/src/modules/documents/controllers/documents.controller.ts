import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PdfService } from '../services/pdf.service';
import { EmailService } from '../services/email.service';
import {
  SendDocumentDto,
  SendPayslipsDto,
  StatementQueryDto,
  SendResultResponse,
  BulkSendResultResponse,
} from '../dto/documents.dto';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService,
  ) {}

  // ============ Invoice Documents ============

  @Get('invoice/:id/pdf')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Generate invoice PDF' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async getInvoicePdf(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.pdfService.generateInvoicePdf(orgId, id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  @Post('invoice/:id/send')
  @Permissions('sales.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send invoice via email' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, type: SendResultResponse })
  async sendInvoice(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: SendDocumentDto,
  ): Promise<SendResultResponse> {
    return this.emailService.sendInvoice(orgId, id, dto);
  }

  // ============ Bill Documents ============

  @Get('bill/:id/pdf')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Generate bill PDF' })
  @ApiParam({ name: 'id', description: 'Bill ID' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async getBillPdf(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.pdfService.generateBillPdf(orgId, id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="bill-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  // ============ Quote Documents ============

  @Get('quote/:id/pdf')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Generate quote PDF' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async getQuotePdf(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.pdfService.generateQuotePdf(orgId, id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="quote-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  @Post('quote/:id/send')
  @Permissions('sales.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send quote via email' })
  @ApiParam({ name: 'id', description: 'Quote ID' })
  @ApiResponse({ status: 200, type: SendResultResponse })
  async sendQuote(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: SendDocumentDto,
  ): Promise<SendResultResponse> {
    return this.emailService.sendQuote(orgId, id, dto);
  }

  // ============ Payslip Documents ============

  @Get('payslip/:id/pdf')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Generate payslip PDF' })
  @ApiParam({ name: 'id', description: 'Payslip ID' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async getPayslipPdf(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.pdfService.generatePayslipPdf(orgId, id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  @Post('payslip/:id/send')
  @Permissions('hr.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send payslip via email' })
  @ApiParam({ name: 'id', description: 'Payslip ID' })
  @ApiResponse({ status: 200, type: SendResultResponse })
  async sendPayslip(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
  ): Promise<SendResultResponse> {
    return this.emailService.sendPayslip(orgId, id);
  }

  @Post('payroll-run/:id/send-all')
  @Permissions('hr.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send all payslips for a payroll run' })
  @ApiParam({ name: 'id', description: 'Payroll Run ID' })
  @ApiResponse({ status: 200, type: BulkSendResultResponse })
  async sendAllPayslips(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto?: SendPayslipsDto,
  ): Promise<BulkSendResultResponse> {
    return this.emailService.sendAllPayslips(orgId, id, dto);
  }

  // ============ Statement Documents ============

  @Get('statement/:customerId/pdf')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Generate customer statement PDF' })
  @ApiParam({ name: 'customerId', description: 'Customer ID' })
  @ApiQuery({ name: 'dateFrom', required: true, description: 'Statement start date' })
  @ApiQuery({ name: 'dateTo', required: true, description: 'Statement end date' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async getStatementPdf(
    @CurrentOrg() orgId: string,
    @Param('customerId') customerId: string,
    @Query() query: StatementQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const dateFrom = new Date(query.dateFrom);
    const dateTo = new Date(query.dateTo);

    const pdfBuffer = await this.pdfService.generateStatementPdf(
      orgId,
      customerId,
      dateFrom,
      dateTo,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${customerId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  // ============ Email Logs ============

  @Get('email-logs')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get email sending logs' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Filter by entity type' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Filter by entity ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination' })
  async getEmailLogs(
    @CurrentOrg() orgId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ data: unknown[]; total: number }> {
    return this.emailService.getEmailLogs(orgId, {
      entityType,
      entityId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
