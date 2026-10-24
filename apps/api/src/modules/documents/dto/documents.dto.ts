import { IsString, IsOptional, IsEmail, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============ Enums ============

export enum DocumentType {
  INVOICE = 'INVOICE',
  QUOTE = 'QUOTE',
  CREDIT_NOTE = 'CREDIT_NOTE',
  BILL = 'BILL',
  PAYSLIP = 'PAYSLIP',
  STATEMENT = 'STATEMENT',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  DELIVERY_CHALLAN = 'DELIVERY_CHALLAN',
}

// ============ Send Document DTOs ============

export class SendDocumentDto {
  @ApiProperty({ description: 'Recipient email address' })
  @IsEmail()
  to: string;

  @ApiPropertyOptional({ description: 'CC email addresses' })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiPropertyOptional({ description: 'BCC email addresses' })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @ApiPropertyOptional({ description: 'Custom email subject' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Custom email message' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Whether to attach the PDF' })
  @IsOptional()
  attachPdf?: boolean = true;
}

export class SendPayslipsDto {
  @ApiPropertyOptional({ description: 'Custom email subject template' })
  @IsOptional()
  @IsString()
  subjectTemplate?: string;

  @ApiPropertyOptional({ description: 'Custom email message template' })
  @IsOptional()
  @IsString()
  messageTemplate?: string;
}

export class StatementQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for the statement (default: January 1st of the end date year)',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date for the statement (default: today)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

/**
 * Statement period: an omitted end date is today and an omitted start date is January 1st of
 * the end date's year (year to date; the opening balance still carries everything before it).
 */
export function resolveStatementPeriod(
  query: StatementQueryDto,
  now: Date = new Date(),
): { dateFrom: Date; dateTo: Date } {
  const dateTo = query.dateTo ? new Date(query.dateTo) : now;
  const dateFrom = query.dateFrom
    ? new Date(query.dateFrom)
    : new Date(Date.UTC(dateTo.getUTCFullYear(), 0, 1));
  return { dateFrom, dateTo };
}

// ============ Response DTOs ============

export class SendResultResponse {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  emailLogId?: string;

  @ApiPropertyOptional()
  error?: string;
}

export class BulkSendResultResponse {
  @ApiProperty()
  total: number;

  @ApiProperty()
  sent: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [Object] })
  errors: Array<{ employeeId: string; error: string }>;
}

// ============ Email Template Context Types ============

export interface InvoiceEmailContext {
  organizationName: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  grandTotal: string;
  currency: string;
  viewLink?: string;
}

export interface QuoteEmailContext {
  organizationName: string;
  customerName: string;
  quoteNumber: string;
  quoteDate: string;
  expiryDate: string;
  grandTotal: string;
  currency: string;
  viewLink?: string;
}

export interface PayslipEmailContext {
  organizationName: string;
  employeeName: string;
  payPeriod: string;
  payDate: string;
  netPay: string;
  currency: string;
}

export interface StatementEmailContext {
  organizationName: string;
  customerName: string;
  statementPeriod: string;
  openingBalance: string;
  totalInvoiced: string;
  totalPaid: string;
  closingBalance: string;
  currency: string;
}
