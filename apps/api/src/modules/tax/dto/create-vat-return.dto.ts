import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CreateVatReturnDto {
  @ApiProperty({ example: '2026-01-01', description: 'First day of the VAT period' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-31', description: 'Last day of the VAT period (inclusive)' })
  @IsDateString()
  endDate: string;
}
