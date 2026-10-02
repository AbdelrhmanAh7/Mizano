import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BankAccountType } from '@prisma/client';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Main Business Account' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, example: '1234567890' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  accountNumber?: string;

  @ApiProperty({ required: false, default: 'USD', example: 'USD' })
  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ enum: BankAccountType })
  @IsEnum(BankAccountType)
  type: BankAccountType;

  @ApiProperty({ required: false, default: '0', example: '1000.00' })
  @IsString()
  @IsOptional()
  openingBalance?: string;

  @ApiProperty({ required: false, example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  openingDate?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  linkedAccountId: string;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
