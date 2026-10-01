import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ApplyVendorCreditDto {
  @ApiProperty({ description: 'Bill whose balance due the vendor credit is applied against' })
  @IsString()
  billId: string;
}
