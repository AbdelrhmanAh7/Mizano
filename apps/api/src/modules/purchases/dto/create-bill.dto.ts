import {
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsOptional,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsDecimalString } from '../../../common/dto/decimal-string';

export class BillLineDto {
  @IsString() @IsOptional() itemId?: string;
  @IsString() @IsOptional() accountId?: string;
  @IsString() @IsOptional() description?: string;
  /** Decimal strings bounded to Decimal(19, 4); the scan confirm path uses the same rule. */
  @IsString() @IsDecimalString() quantity: string;
  @IsString() @IsDecimalString() rate: string;
  /** Percentage (14 => 14%), at most 2 decimals. */
  @IsString() @IsOptional() @IsDecimalString(2) taxRate?: string;
}

export class CreateBillDto {
  @ApiProperty() @IsString() vendorId: string;
  @ApiProperty({ required: false, description: 'Vendor bill number; auto-numbered when omitted' })
  @IsString()
  @IsOptional()
  billNumber?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() reference?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @Length(3, 3) currencyCode?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() notes?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() projectId?: string;
  @ApiProperty({ type: [BillLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => BillLineDto)
  lines: BillLineDto[];
}
