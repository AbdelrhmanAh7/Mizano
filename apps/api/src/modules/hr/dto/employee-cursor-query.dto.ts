import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class EmployeeCursorQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'TERMINATED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
}
