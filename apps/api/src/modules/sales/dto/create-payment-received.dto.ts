import {
  IsString,
  IsDateString,
  IsEnum,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode } from '@prisma/client';

class PaymentAllocationDto {
  @IsString() invoiceId: string;
  @IsString() amount: string;
}

export class CreatePaymentReceivedDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() amount: string;
  @ApiProperty({ enum: PaymentMode }) @IsEnum(PaymentMode) paymentMode: PaymentMode;
  @ApiProperty() @IsString() depositToAccountId: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(100) reference?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(1000) notes?: string;
  @ApiProperty({ type: [PaymentAllocationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => PaymentAllocationDto)
  allocations: PaymentAllocationDto[];
}
