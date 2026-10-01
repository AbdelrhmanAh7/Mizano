import { IsString, IsDateString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '../../../common/dto/decimal-string';

export class CreateVendorCreditDto {
  @ApiProperty() @IsString() vendorId: string;
  @ApiProperty({ description: 'Posted bill this credit is issued against' })
  @IsString()
  billId: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(500) @IsOptional() reason?: string;
  @ApiProperty({ description: 'Decimal string, gross of VAT (what the vendor credits us)' })
  @IsDecimalString()
  amount: string;
  @ApiPropertyOptional({
    description:
      'Expense/returns account credited (defaults to the bill largest expense line account)',
  })
  @IsString()
  @IsOptional()
  accountId?: string;
}
