import {
  IsString,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
}
