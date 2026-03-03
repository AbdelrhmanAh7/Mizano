import { IsString, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVendorCreditDto {
  @ApiProperty() @IsString() vendorId: string;
  @ApiProperty() @IsString() billId: string;
  @ApiProperty({ required: false }) @IsDateString() @IsOptional() date?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() reason?: string;
  @ApiProperty() @IsString() amount: string;
}
