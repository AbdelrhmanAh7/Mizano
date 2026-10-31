import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class BillAccountOptionsQueryDto {
  @ApiProperty({
    required: false,
    description: 'Vendor whose most recent eligible line account is returned as the default',
  })
  @IsString()
  @IsOptional()
  vendorId?: string;
}
