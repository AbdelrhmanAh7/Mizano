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
import { IsDecimalString } from './decimal-string';

export class QuoteLineDto {
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

export class CreateQuoteDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsDateString() expiryDate: string;
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(2000) terms?: string;
}
