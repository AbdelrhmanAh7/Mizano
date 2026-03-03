import { IsString, IsOptional, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class BillingAddressDto {
  @IsString() @IsOptional() street?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() state?: string;
  @IsString() @IsOptional() postalCode?: string;
  @IsString() @IsOptional() country?: string;
}

export class CreateVendorDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() displayName?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() email?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() phone?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() currency?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() taxId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() address?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() city?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() country?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() bankName?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() bankAccount?: string;
  @ApiProperty({ required: false }) @IsInt() @Min(0) @IsOptional() paymentTerms?: number;
  @ApiProperty({ required: false })
  @ValidateNested()
  @Type(() => BillingAddressDto)
  @IsOptional()
  billingAddress?: BillingAddressDto;
}
