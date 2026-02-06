import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsEnum,
  IsDateString,
} from 'class-validator';
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
  @ApiProperty({ description: 'Start date for the statement' })
  @IsDateString()
  dateFrom: string;

  @ApiProperty({ description: 'End date for the statement' })
  @IsDateString()
  dateTo: string;
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
