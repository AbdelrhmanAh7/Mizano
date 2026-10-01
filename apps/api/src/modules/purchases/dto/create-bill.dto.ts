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

export class BillLineDto {
  @IsString() @IsOptional() itemId?: string;
  @IsString() @IsOptional() accountId?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() quantity: string;
  @IsString() rate: string;
  @IsString() @IsOptional() taxRate?: string;
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
