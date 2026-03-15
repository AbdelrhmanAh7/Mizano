import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class BillQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by vendor ID' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated bill statuses (DRAFT, OPEN, OVERDUE, PARTIALLY_PAID, PAID, VOID)',
    example: 'OPEN,OVERDUE,PARTIALLY_PAID',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Only return bills with balance due > 0' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasBalance?: boolean;
}
