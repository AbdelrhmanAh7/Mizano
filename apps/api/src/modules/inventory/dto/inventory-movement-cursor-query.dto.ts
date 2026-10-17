import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class InventoryMovementCursorQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  source?: string;
}
