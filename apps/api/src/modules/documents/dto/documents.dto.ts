import { IsString, IsOptional, IsEmail, IsArray, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============ Send Document DTOs ============

/** Language of a generated document (`?locale=ar` renders Arabic, right-to-left). */
export class DocumentLocaleQueryDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'], default: 'en' })
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}

const DOCUMENT_LOCALES = ['en', 'ar'] as const;
type RequestedDocumentLocale = (typeof DOCUMENT_LOCALES)[number];

/**
 * The language of a generated document: an explicit `locale` (query or body), else the best
 * `en`/`ar` match of the request's Accept-Language (q-values honoured, q=0 refused), else Arabic.
 */
export function resolveDocumentLocale(
  explicit: RequestedDocumentLocale | undefined,
  acceptLanguage: string | undefined,
): RequestedDocumentLocale {
  if (explicit) return explicit;
  let best: { locale: RequestedDocumentLocale; q: number } | undefined;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const [tag, ...params] = part.trim().split(';');
    const primary = tag.trim().toLowerCase().split('-')[0];
    const locale = DOCUMENT_LOCALES.find((l) => l === primary);
    if (!locale) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam === undefined ? 1 : Number(qParam.slice(2));
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { locale, q };
  }
  return best?.locale ?? 'ar';
}

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

  @ApiPropertyOptional({
    enum: ['en', 'ar'],
    default: 'en',
    description: 'Language of the attached PDF',
  })
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
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
