import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '../../../common/dto/decimal-string';

export class CheckPossibleDuplicateBillsDto {
  @ApiPropertyOptional({ description: 'Resolved vendor ID if known' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Vendor name (matched case-insensitively with whitespace normalized)',
  })
  @IsOptional()
  @IsString()
  vendorName?: string;

  @ApiPropertyOptional({ description: 'Total amount as exact decimal string' })
  @IsOptional()
  // Keep the raw JSON value: implicit conversion would turn a (possibly rounded) number into a string.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.amount)
  @IsString()
  @IsDecimalString()
  amount?: string;

  @ApiPropertyOptional({ description: 'Document date (YYYY-MM-DD; timestamps are rejected)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be a calendar date (YYYY-MM-DD)' })
  date?: string;

  @ApiPropertyOptional({
    description: 'Currency code (e.g. EGP); without it the result is "unknown"',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Existing bill to check; it is excluded from matches' })
  @IsOptional()
  @IsString()
  billId?: string;
}
