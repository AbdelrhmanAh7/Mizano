import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class VatReturnDraftQueryDto {
  @ApiProperty({
    description: 'Start date of the draft period (ISO format)',
    example: '2024-01-01',
  })
  @IsNotEmpty()
  @IsDateString()
  from: string;

  @ApiProperty({ description: 'End date of the draft period (ISO format)', example: '2024-01-31' })
  @IsNotEmpty()
  @IsDateString()
  to: string;
}
