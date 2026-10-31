import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BankTransactionType } from '@prisma/client';
import { IsDecimalString } from '../../../common/dto/decimal-string';

/** One statement line: the direction is `type`, so the amount is never negative. */
export class BankTransactionLineDto {
  @ApiProperty({ example: '2026-10-31' })
  @IsDateString({ strict: true })
  date: string;

  @ApiProperty({ enum: BankTransactionType })
  @IsEnum(BankTransactionType)
  type: BankTransactionType;

  @ApiProperty({ example: '250.50' })
  @IsString()
  @IsDecimalString()
  amount: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  reference?: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  payee?: string;
}

export class CreateBankTransactionDto extends BankTransactionLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountId: string;
}

export class BulkImportTransactionsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountId: string;

  @ApiProperty({ type: [BankTransactionLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => BankTransactionLineDto)
  transactions: BankTransactionLineDto[];
}
