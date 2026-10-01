import {
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsDecimalString } from '../../../common/dto/decimal-string';

export class InvoiceLineDto {
  @IsString() @IsOptional() itemId?: string;
  @IsString() @MaxLength(500) description: string;
  @IsDecimalString() quantity: string;
  @IsDecimalString() rate: string;
  @ApiProperty({ required: false, description: 'Line discount percent (0-100)' })
  @IsOptional()
  @IsDecimalString()
  discount?: string;
  @ApiProperty({ required: false, description: 'Line tax percent (14 means 14%)' })
  @IsOptional()
  @IsDecimalString(2)
  taxRate?: string;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() quoteId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() projectId?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
  @ApiProperty({ required: false, description: 'Shipping/handling charge, decimal string' })
  @IsOptional()
  @IsDecimalString()
  shippingAmount?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(2000) terms?: string;
}
