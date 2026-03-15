import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class BillCursorQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({
    required: false,
    description: 'Comma-separated bill statuses (DRAFT, OPEN, OVERDUE, PARTIALLY_PAID, PAID, VOID)',
    example: 'OPEN,OVERDUE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false, description: 'Only return bills with balance due > 0' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasBalance?: boolean;

  @ApiProperty({ required: false, example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
