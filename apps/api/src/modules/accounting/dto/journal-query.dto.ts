import { IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class JournalQueryDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
