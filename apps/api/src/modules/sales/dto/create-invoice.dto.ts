import { IsString, IsDateString, IsArray, ValidateNested, ArrayMinSize, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class InvoiceLineDto {
  @IsString() @IsOptional() itemId?: string;
  @IsString() description: string;
  @IsString() quantity: string;
  @IsString() rate: string;
  @IsString() @IsOptional() discount?: string;
  @IsString() @IsOptional() taxRate?: string;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() quoteId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() projectId?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiProperty({ type: [InvoiceLineDto] }) @IsArray() @ValidateNested({ each: true }) @ArrayMinSize(1) @Type(() => InvoiceLineDto) lines: InvoiceLineDto[];
  @ApiProperty({ required: false }) @IsString() @IsOptional() shippingAmount?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(2000) terms?: string;
}
