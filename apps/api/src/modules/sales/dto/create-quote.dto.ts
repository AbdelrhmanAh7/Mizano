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

class QuoteLineDto {
  @IsString() @IsOptional() itemId?: string;
  @IsString() description: string;
  @IsString() quantity: string;
  @IsString() rate: string;
  @IsString() @IsOptional() discount?: string;
  @IsString() @IsOptional() taxRate?: string;
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
