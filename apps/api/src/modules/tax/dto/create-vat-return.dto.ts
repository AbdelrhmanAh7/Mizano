import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateVatReturnDto {
  @ApiProperty({ example: '2026-01-01', description: 'First day of the VAT period' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-31', description: 'Last day of the VAT period (inclusive)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: '2026-01', description: 'Optional period label' })
  @IsString()
  @IsOptional()
  period?: string;
}
