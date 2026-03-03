import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

export class CreateBankRuleDto {
  @ApiProperty({ example: 'Categorize Amazon purchases' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  bankAccountId?: string | null;

  @ApiProperty({ required: false, default: [], type: [Object] })
  @IsArray()
  @IsOptional()
  conditions?: Prisma.InputJsonValue;

  @ApiProperty({ required: false, default: {}, type: Object })
  @IsObject()
  @IsOptional()
  action?: Prisma.InputJsonValue;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
