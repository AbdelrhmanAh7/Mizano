import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Filters of the movements list. A real class (not an intersection type) so the global
 * ValidationPipe converts `page` / `limit` to numbers; a plain `PaginationDto & {...}` query has
 * no runtime type and Prisma rejected the string `take`.
 */
export class InventoryMovementQueryDto extends PaginationDto {
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

  // Accepted by existing frontend filters; filtering behavior remains in the service.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  source?: string;
}
