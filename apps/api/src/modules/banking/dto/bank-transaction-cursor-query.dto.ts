import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class BankTransactionCursorQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;
}
