import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class InvoiceQueryDto extends PaginationDto {
  @ApiProperty({ required: false, enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;
  @ApiProperty({ required: false }) @IsString() @IsOptional() customerId?: string;
  @ApiProperty({ required: false }) @IsDateString() @IsOptional() dateFrom?: string;
  @ApiProperty({ required: false }) @IsDateString() @IsOptional() dateTo?: string;
}
