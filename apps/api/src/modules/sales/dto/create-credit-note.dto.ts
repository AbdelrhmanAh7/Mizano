import { IsString, IsDateString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreditNoteType } from '@prisma/client';

export class CreateCreditNoteDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() invoiceId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() @MaxLength(500) reason: string;
  @ApiProperty() @IsString() amount: string;
  @ApiProperty({ enum: CreditNoteType }) @IsEnum(CreditNoteType) type: CreditNoteType;
  @ApiProperty({ required: false }) @IsString() @IsOptional() appliedToInvoiceId?: string;
}
