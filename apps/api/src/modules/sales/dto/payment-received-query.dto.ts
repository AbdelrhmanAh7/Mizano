import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum PaymentModeFilter {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  CHEQUE = 'CHEQUE',
  ONLINE = 'ONLINE',
  OTHER = 'OTHER',
}

export class PaymentReceivedQueryDto extends PaginationDto {
  @ApiProperty({ required: false, description: 'Filter by customer ID' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false, enum: PaymentModeFilter })
  @IsEnum(PaymentModeFilter)
  @IsOptional()
  paymentMode?: PaymentModeFilter;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
