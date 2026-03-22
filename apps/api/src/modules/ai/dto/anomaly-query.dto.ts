import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { AnomalyType, AnomalySeverity } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AnomalyQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['TRANSACTION', 'OVERTIME', 'SPENDING', 'PAYROLL', 'INVENTORY', 'REVENUE'],
    description: 'Filter by anomaly type',
  })
  @IsEnum(AnomalyType)
  @IsOptional()
  type?: AnomalyType;

  @ApiPropertyOptional({
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    description: 'Filter by severity level',
  })
  @IsEnum(AnomalySeverity)
  @IsOptional()
  severity?: AnomalySeverity;

  @ApiPropertyOptional({
    description: 'Filter by resolved status',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isResolved?: boolean;
}
