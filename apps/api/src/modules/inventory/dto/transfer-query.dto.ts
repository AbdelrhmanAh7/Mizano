import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** Filters of the transfers list (see {@link InventoryMovementQueryDto} for why this is a class). */
export class TransferQueryDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fromWarehouseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  toWarehouseId?: string;
}
