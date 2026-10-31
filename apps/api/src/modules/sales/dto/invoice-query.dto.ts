import { IsOptional, IsEnum, IsString, IsDateString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
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
  /** Only invoices a payment or credit can still settle: posted, not void, balance due > 0. */
  @ApiProperty({ required: false, description: 'Only open invoices with a balance due' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  open?: boolean;
}
