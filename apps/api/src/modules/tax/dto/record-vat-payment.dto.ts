import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDecimalString } from '../../../common/dto/decimal-string';

export class RecordVatPaymentDto {
  @ApiProperty({
    example: '1250.50',
    description:
      'Amount paid to the tax authority, as a decimal string (max 4 decimals); must equal the net payable of the return exactly',
  })
  @IsString()
  @IsDecimalString()
  amount: string;

  @ApiProperty({ example: '2026-04-15', description: 'Payment date; also the journal date' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Bank or cash account the payment is made from' })
  @IsString()
  @IsNotEmpty()
  paidFromAccountId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
