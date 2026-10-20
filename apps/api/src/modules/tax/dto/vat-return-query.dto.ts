import { ApiProperty } from '@nestjs/swagger';
import { VATReturnStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';

export class VatReturnQueryDto {
  @ApiProperty({ required: false, enum: VATReturnStatus })
  @IsOptional()
  @IsEnum(VATReturnStatus)
  status?: VATReturnStatus;

  @ApiProperty({ required: false, example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(2200)
  year?: number;
}

export class VatReturnDraftQueryDto {
  @ApiProperty({ example: '2026-01-01', description: 'Start date of the VAT period (ISO 8601)' })
  @IsNotEmpty()
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-03-31', description: 'End date of the VAT period (ISO 8601)' })
  @IsNotEmpty()
  @IsDateString()
  periodEnd: string;
}
