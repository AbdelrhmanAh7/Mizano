import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @ApiProperty({ example: '1000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'Cash' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiProperty({ required: false, default: 'USD' })
  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
