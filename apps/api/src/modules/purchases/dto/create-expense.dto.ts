import { IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() accountId: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() vendorId?: string;
  @ApiProperty() @IsString() amount: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() taxRate?: string;
  @ApiProperty({ required: false }) @IsBoolean() @IsOptional() taxInclusive?: boolean;
  @ApiProperty() @IsString() paidThroughAccountId: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() description?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() reference?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() projectId?: string;
}
