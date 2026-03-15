import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { BankAccountType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class BankAccountQueryDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, enum: BankAccountType })
  @IsOptional()
  @IsEnum(BankAccountType)
  type?: BankAccountType;
}
