import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  Max,
  MaxLength,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class AddressDto {
  @IsString() @IsOptional() @MaxLength(255) street?: string | null;
  @IsString() @IsOptional() @MaxLength(100) city?: string | null;
  @IsString() @IsOptional() @MaxLength(100) state?: string | null;
  @IsString() @IsOptional() @MaxLength(20) postalCode?: string | null;
  @IsString() @IsOptional() @MaxLength(100) country?: string | null;
}

export class CreateCustomerDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(200) displayName?:
    | string
    | null;
  @ApiProperty({ required: false }) @IsEmail() @IsOptional() email?: string | null;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) phone?: string | null;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @Length(3, 3) currency?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(50) taxId?: string | null;
  @ApiProperty({ required: false })
  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  billingAddress?: AddressDto | null;
  @ApiProperty({ required: false })
  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  shippingAddress?: AddressDto | null;
  @ApiProperty({ required: false }) @IsInt() @Min(0) @Max(365) @IsOptional() paymentTerms?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() priceListId?: string | null;
}
