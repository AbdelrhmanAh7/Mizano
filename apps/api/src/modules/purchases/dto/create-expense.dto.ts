import { IsString, IsDateString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '../../../common/dto/decimal-string';

export class CreateExpenseDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ description: 'Expense account (type EXPENSE) that is debited' })
  @IsString()
  accountId: string;
  @ApiPropertyOptional() @IsString() @IsOptional() vendorId?: string;
  @ApiProperty({
    description:
      'Decimal string. Net of VAT, or gross when taxInclusive is true; the VAT amount is always computed by the server from taxRate',
  })
  @IsDecimalString()
  amount: string;
  @ApiPropertyOptional({ description: 'VAT percentage as a decimal string (14 => 14%)' })
  @IsDecimalString(2)
  @IsOptional()
  taxRate?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() taxInclusive?: boolean;
  @ApiProperty({ description: 'Bank or cash account the expense is paid from' })
  @IsString()
  paidThroughAccountId: string;
  @ApiPropertyOptional() @IsString() @MaxLength(500) @IsOptional() description?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() reference?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
}
