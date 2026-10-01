import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class RefundVendorCreditDto {
  @ApiProperty({ description: 'Bank or cash account the refund is received into' })
  @IsString()
  bankAccountId: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
}
