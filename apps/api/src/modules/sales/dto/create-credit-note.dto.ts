import { IsString, IsDateString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditNoteType } from '@prisma/client';
import { IsDecimalString } from './decimal-string';

export class CreateCreditNoteDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() invoiceId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() @MaxLength(500) reason: string;
  @ApiProperty({ description: 'Decimal string, gross of VAT (what the customer is credited)' })
  @IsDecimalString()
  amount: string;
  @ApiProperty({ enum: CreditNoteType }) @IsEnum(CreditNoteType) type: CreditNoteType;
  @ApiPropertyOptional({
    description: 'APPLY_TO_INVOICE only: invoice whose balance is reduced (defaults to invoiceId)',
  })
  @IsString()
  @IsOptional()
  appliedToInvoiceId?: string;
  @ApiPropertyOptional({
    description: 'REFUND only (required): bank/cash account the refund is paid from',
  })
  @IsString()
  @IsOptional()
  refundAccountId?: string;
}
