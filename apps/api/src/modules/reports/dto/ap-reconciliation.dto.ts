import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ApReconciliationQueryDto {
  @ApiPropertyOptional({
    description: 'Cutoff date (YYYY-MM-DD)',
    example: '2026-10-23',
  })
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class ApReconciliationResponseDto {
  @ApiProperty({
    description: 'Reconciliation cutoff date (YYYY-MM-DD)',
    example: '2026-10-23',
  })
  asOf: string;

  @ApiProperty({
    description: 'Base currency ISO 4217 code',
    example: 'SAR',
  })
  currencyCode: string;

  @ApiProperty({
    description: 'AP subledger open balance total as of cutoff date (fixed 4-dp string)',
    example: '1250.0000',
  })
  subledgerTotal: string;

  @ApiProperty({
    description: 'AP control account(s) posted balance as of cutoff date (fixed 4-dp string)',
    example: '1250.0000',
  })
  controlBalance: string;

  @ApiProperty({
    description: 'Variance: subledgerTotal - controlBalance (fixed 4-dp string)',
    example: '0.0000',
  })
  difference: string;

  @ApiProperty({
    description: 'True when subledger matches control account (difference is 0.0000)',
    example: true,
  })
  ok: boolean;
}
