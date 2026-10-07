import { IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VatReturnDraftQueryDto {
  @ApiProperty({ description: 'Start date in ISO format', example: '2023-01-01' })
  @IsDateString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ description: 'End date in ISO format', example: '2023-01-31' })
  @IsDateString()
  @IsNotEmpty()
  to: string;
}
