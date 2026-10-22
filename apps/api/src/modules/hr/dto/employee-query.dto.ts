import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class EmployeeQueryDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ obj, key }) => {
    const value = obj[key];
    return value === 'true' ? true : value === 'false' ? false : value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, default: 50 })
  limit?: number = 50;

  @ApiProperty({ required: false, default: 'asc' })
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  department?: string;

  // Accepted by existing frontend filters; filtering behavior remains in the service.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  departmentId?: string;
}
