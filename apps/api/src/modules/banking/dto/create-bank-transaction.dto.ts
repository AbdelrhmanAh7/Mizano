import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BankTransactionType } from '@prisma/client';

export class CreateBankTransactionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountId: string;

  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  date: string;

  @ApiProperty({ enum: BankTransactionType })
  @IsEnum(BankTransactionType)
  type: BankTransactionType;

  @ApiProperty({ example: '100.00' })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  payee?: string;
}
