import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ description: 'Document date (strict ISO YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/, {
    message: 'date must be a valid ISO date string (YYYY-MM-DD)',
  })
  date?: string;

  @ApiPropertyOptional({ description: 'Currency code (e.g. EGP, USD, EUR)' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Existing draft bill ID to check (optional)' })
  @IsOptional()
  @IsString()
  billId?: string;
}
