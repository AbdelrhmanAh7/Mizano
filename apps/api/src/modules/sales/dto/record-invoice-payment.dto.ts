import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsDecimalString } from '../../../common/dto/decimal-string';
import { PAYMENT_IDEMPOTENCY_KEY_PATTERN } from '../../../common/utils/payment-idempotency';

/** Body of POST /invoices/:id/record-payment: one payment allocated to that single invoice. */
export class RecordInvoicePaymentDto {
  @ApiProperty({ description: 'Decimal string, at most the invoice balance due' })
  @IsDecimalString()
  amount: string;

  @ApiProperty() @IsDateString() date: string;

  @ApiPropertyOptional({
    description: 'Account the money is deposited to (defaults to the organization bank/cash)',
  })
  @IsOptional()
  @IsString()
  depositToAccountId?: string;

  @ApiPropertyOptional({ description: 'Legacy name for depositToAccountId' })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiPropertyOptional({ enum: PaymentMode, description: 'Defaults to BANK_TRANSFER' })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) reference?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @ApiPropertyOptional({
    description:
      'One key per "record payment" action, resent unchanged on retries: a retry returns the payment already recorded instead of recording it twice',
  })
  @IsOptional()
  @IsString()
  @Matches(PAYMENT_IDEMPOTENCY_KEY_PATTERN)
  idempotencyKey?: string;
}
