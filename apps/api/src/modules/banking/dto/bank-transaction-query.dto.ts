import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumberString, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class BankTransactionQueryDto extends PaginationDto {
  @ApiProperty({ required: false, default: 50 })
  limit?: number = 50;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

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
  @IsNumberString()
  amountMin?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  amountMax?: string;
}
