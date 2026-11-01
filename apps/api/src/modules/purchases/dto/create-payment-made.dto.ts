import {
  IsString,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsIn,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_IDEMPOTENCY_KEY_PATTERN } from '../../../common/utils/payment-idempotency';

class PaymentAllocationDto {
  @IsString() billId: string;
  @IsString() amount: string;
}

export class CreatePaymentMadeDto {
  @ApiProperty() @IsString() vendorId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() amount: string;
  @ApiProperty()
  @IsIn(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'CHEQUE', 'ONLINE', 'OTHER'])
  paymentMode:
    | 'CASH'
    | 'BANK_TRANSFER'
    | 'CREDIT_CARD'
    | 'DEBIT_CARD'
    | 'CHEQUE'
    | 'ONLINE'
    | 'OTHER';
  @ApiProperty() @IsString() paidFromAccountId: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() reference?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() notes?: string;
  @ApiProperty({ type: [PaymentAllocationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => PaymentAllocationDto)
  allocations: Array<{ billId: string; amount: string }>;

  @ApiPropertyOptional({
    description:
      'One key per "record payment" action, resent unchanged on retries: a retry returns the payment already recorded instead of recording it twice',
  })
  @IsOptional()
  @IsString()
  @Matches(PAYMENT_IDEMPOTENCY_KEY_PATTERN)
  idempotencyKey?: string;
}
